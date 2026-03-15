// Session manager - ported from WildwoodComponents.Blazor/Services/WildwoodSessionManager.cs
// Manages session lifecycle: token storage, auto-refresh at 80%, sliding expiration, session expiry
// Includes reactive 401 handling: HTTP client triggers token refresh on 401, then retries (Blazor parity)

import type { WildwoodConfig } from '../client/types.js';
import type { StorageAdapter } from '../platform/types.js';
import type { WildwoodEventEmitter } from '../events/eventEmitter.js';
import type { HttpClient } from '../client/httpClient.js';
import type { AuthService } from './authService.js';
import type { AuthenticationResponse } from './types.js';
import { getRefreshTimeMs } from './tokenUtils.js';

const SESSION_KEYS = {
  authData: 'ww_session_auth',
  sessionExpiry: 'ww_session_expiry',
} as const;

const RECENT_REFRESH_WINDOW_MS = 30_000; // 30 seconds

export class SessionManager {
  private currentUser: AuthenticationResponse | null = null;
  private sessionExpiry: number | null = null; // epoch ms
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private isInitializedFlag = false;
  private disposed = false;
  private lastRefreshTime = 0;
  private refreshInProgress: Promise<boolean> | null = null;

  get isAuthenticated(): boolean {
    return this.currentUser != null && !!this.currentUser.jwtToken && !this.isSessionExpired();
  }

  get isInitialized(): boolean {
    return this.isInitializedFlag;
  }

  get accessToken(): string | null {
    if (this.isSessionExpired()) return null;
    return this.currentUser?.jwtToken ?? null;
  }

  get userId(): string | null {
    return this.currentUser?.userId ?? this.currentUser?.id ?? null;
  }

  get userEmail(): string | null {
    return this.currentUser?.email ?? null;
  }

  get user(): AuthenticationResponse | null {
    return this.currentUser;
  }

  constructor(
    private config: WildwoodConfig,
    private authService: AuthService,
    private storage: StorageAdapter,
    private events: WildwoodEventEmitter,
    private http: HttpClient,
  ) {
    // Wire up auth service callbacks
    this.authService.setAuthChangedHandler((resp) => this.onAuthChanged(resp));
    this.authService.setLogoutHandler(() => this.onAuthLogout());

    // Wire up HTTP client token provider
    this.http.setTokenProvider(async () => this.accessToken);

    // Wire up reactive 401 handling (Blazor parity: on 401, refresh token and retry)
    this.http.setOn401Refresh(() => this.refreshToken());
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitializedFlag) return;

    try {
      // Restore session expiry
      const expiryStr = await this.storage.getItem(SESSION_KEYS.sessionExpiry);
      if (expiryStr) {
        const expiry = parseInt(expiryStr, 10);
        if (!isNaN(expiry)) {
          this.sessionExpiry = expiry;
          if (this.isSessionExpired()) {
            await this.clearStorage();
            this.events.emit('sessionExpired');
            return;
          }
        }
      }

      // Restore auth data
      const storedAuth = await this.authService.getStoredUser();
      if (storedAuth?.jwtToken) {
        this.currentUser = storedAuth;

        if (this.sessionExpiry == null) {
          await this.extendSession();
        }

        // If auto-refresh enabled, try to refresh on init
        if (this.config.enableAutoTokenRefresh) {
          const refreshed = await this.refreshToken();
          if (!refreshed) {
            // Token might still be valid - schedule based on current exp
            this.scheduleRefreshFromToken(storedAuth.jwtToken);
          }
        }
      }
    } catch (err) {
      console.error('[Wildwood] Error initializing session manager:', err);
    } finally {
      this.isInitializedFlag = true;
      this.events.emit('authChanged', this.currentUser);
      this.events.emit('sessionInitialized', this.isAuthenticated);
    }
  }

  async login(authResponse: AuthenticationResponse): Promise<boolean> {
    if (!authResponse?.jwtToken) return false;

    try {
      this.currentUser = authResponse;
      const expirationMinutes = this.config.sessionExpirationMinutes ?? 60;
      this.sessionExpiry = Date.now() + expirationMinutes * 60 * 1000;

      // Persist
      await this.storage.setItem(SESSION_KEYS.authData, JSON.stringify(authResponse));
      await this.storage.setItem(SESSION_KEYS.sessionExpiry, String(this.sessionExpiry));

      // Schedule proactive refresh
      if (this.config.enableAutoTokenRefresh) {
        this.scheduleRefreshFromToken(authResponse.jwtToken);
      }

      // Notify consumers of auth state change
      this.events.emit('authChanged', authResponse);

      return true;
    } catch (err) {
      console.error('[Wildwood] Error during login:', err);
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      this.stopRefreshTimer();
      await this.clearStorage();
    } catch (err) {
      console.error('[Wildwood] Error during logout:', err);
    }
  }

  async refreshToken(): Promise<boolean> {
    if (this.config.enableAutoTokenRefresh === false) return false;
    if (!this.currentUser?.jwtToken) return false;

    // Check if refreshed recently
    const timeSinceLast = Date.now() - this.lastRefreshTime;
    if (timeSinceLast < RECENT_REFRESH_WINDOW_MS) return true;

    // Concurrent refresh protection - reuse in-flight promise
    if (this.refreshInProgress) {
      return this.refreshInProgress;
    }

    this.refreshInProgress = this.doRefresh();
    try {
      return await this.refreshInProgress;
    } finally {
      this.refreshInProgress = null;
    }
  }

  async onAppResumed(): Promise<void> {
    if (!this.isInitializedFlag || this.config.enableAutoTokenRefresh === false) return;
    if (!this.currentUser) return;

    if (this.isSessionExpired()) {
      this.stopRefreshTimer();
      await this.clearStorage();
      this.events.emit('sessionExpired');
      return;
    }

    await this.refreshToken();
  }

  async touchSession(): Promise<void> {
    if (this.isAuthenticated && this.config.slidingExpiration !== false) {
      await this.extendSession();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopRefreshTimer();
  }

  // ---------------------------------------------------------------------------
  // Proactive Refresh Timer
  // ---------------------------------------------------------------------------

  private scheduleRefreshFromToken(jwtToken: string): void {
    try {
      const delayMs = getRefreshTimeMs(jwtToken);

      if (delayMs <= 0) {
        // Token already at or past refresh point - refresh in 1 second
        this.scheduleRefreshTimer(1000);
        return;
      }

      // Clamp: min 30s, max 55 min
      const clamped = Math.max(30_000, Math.min(delayMs, 55 * 60 * 1000));
      this.scheduleRefreshTimer(clamped);
    } catch {
      // Fallback: refresh in 10 minutes
      this.scheduleRefreshTimer(10 * 60 * 1000);
    }
  }

  private scheduleRefreshTimer(delayMs: number): void {
    this.stopRefreshTimer();
    this.refreshTimer = setTimeout(() => this.onRefreshTimerElapsed(), delayMs);
  }

  private stopRefreshTimer(): void {
    if (this.refreshTimer != null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private onRefreshTimerElapsed(): void {
    if (this.disposed || !this.currentUser) return;
    this.handleProactiveRefresh();
  }

  private async handleProactiveRefresh(): Promise<void> {
    const refreshed = await this.refreshToken();

    if (!refreshed && !this.disposed && this.currentUser) {
      // Retry in 60 seconds
      this.scheduleRefreshTimer(60_000);
    }
    // If refreshed, onAuthChanged will reschedule with new token
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private async doRefresh(): Promise<boolean> {
    // Double-check after acquiring "lock"
    const timeSinceLast = Date.now() - this.lastRefreshTime;
    if (timeSinceLast < RECENT_REFRESH_WINDOW_MS) return true;

    try {
      const refreshed = await this.authService.refreshToken();
      if (refreshed) {
        this.lastRefreshTime = Date.now();
        return true;
      }
      return false;
    } catch {
      // Fail-open: network errors don't clear tokens (Blazor parity)
      return false;
    }
  }

  private isSessionExpired(): boolean {
    if (this.sessionExpiry == null) return false;
    return Date.now() > this.sessionExpiry;
  }

  private async extendSession(): Promise<void> {
    const expirationMinutes = this.config.sessionExpirationMinutes ?? 60;
    this.sessionExpiry = Date.now() + expirationMinutes * 60 * 1000;
    try {
      await this.storage.setItem(SESSION_KEYS.sessionExpiry, String(this.sessionExpiry));
    } catch {
      // Storage write failures are non-fatal
    }
  }

  private async clearStorage(): Promise<void> {
    this.currentUser = null;
    this.sessionExpiry = null;
    try {
      await this.storage.removeItem(SESSION_KEYS.authData);
      await this.storage.removeItem(SESSION_KEYS.sessionExpiry);
    } catch {
      // Storage failures are non-fatal
    }
  }

  // ---------------------------------------------------------------------------
  // Event Handlers (called by AuthService)
  // ---------------------------------------------------------------------------

  private onAuthChanged(authResponse: AuthenticationResponse): void {
    if (!authResponse?.jwtToken) return;

    this.currentUser = authResponse;

    // Extend session with sliding expiration
    if (this.config.slidingExpiration !== false) {
      this.extendSession().catch(() => {
        /* non-fatal */
      });
    }

    // Persist updated auth data
    this.storage.setItem(SESSION_KEYS.authData, JSON.stringify(authResponse)).catch(() => {
      /* non-fatal */
    });

    // Reschedule proactive refresh
    if (this.config.enableAutoTokenRefresh) {
      this.scheduleRefreshFromToken(authResponse.jwtToken);
    }

    // Notify consumers
    this.events.emit('tokenRefreshed', authResponse.jwtToken);
  }

  private onAuthLogout(): void {
    this.stopRefreshTimer();
    this.currentUser = null;
    this.sessionExpiry = null;
  }
}
