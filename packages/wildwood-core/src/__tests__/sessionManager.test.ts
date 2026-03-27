import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../auth/sessionManager.js';
import { AuthService } from '../auth/authService.js';
import { HttpClient } from '../client/httpClient.js';
import { WildwoodEventEmitter } from '../events/eventEmitter.js';
import { MemoryStorageAdapter } from '../platform/storageService.js';
import type { WildwoodConfig } from '../client/types.js';
import type { AuthenticationResponse } from '../auth/types.js';

function makeJwt(payload: object): string {
  const h = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = btoa(JSON.stringify(payload));
  return `${h}.${p}.sig`;
}

function futureJwt(lifetimeSeconds = 3600): string {
  const now = Math.floor(Date.now() / 1000);
  return makeJwt({ sub: 'user-1', exp: now + lifetimeSeconds, iat: now });
}

function mockAuthResponse(overrides?: Partial<AuthenticationResponse>): AuthenticationResponse {
  return {
    id: 'auth-1',
    userId: 'user-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    jwtToken: futureJwt(),
    refreshToken: 'refresh-token',
    requiresTwoFactor: false,
    requiresPasswordReset: false,
    roles: ['User'],
    permissions: [],
    requiresDisclaimerAcceptance: false,
    ...overrides,
  };
}

function createDeps(configOverrides?: Partial<WildwoodConfig>) {
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);

  const config: WildwoodConfig = {
    baseUrl: 'https://api.example.com',
    enableRetry: false,
    sessionExpirationMinutes: 60,
    enableAutoTokenRefresh: false,
    ...configOverrides,
  };
  const storage = new MemoryStorageAdapter();
  const events = new WildwoodEventEmitter();
  const http = new HttpClient(config);
  const auth = new AuthService(http, storage, events);
  const session = new SessionManager(config, auth, storage, events, http);

  return { fetchSpy, config, storage, events, http, auth, session };
}

describe('SessionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  describe('initialize', () => {
    it('starts as not initialized', () => {
      const { session } = createDeps();
      expect(session.isInitialized).toBe(false);
      expect(session.isAuthenticated).toBe(false);
    });

    it('marks as initialized after init', async () => {
      const { session, events } = createDeps();
      const handler = vi.fn();
      events.on('sessionInitialized', handler);

      await session.initialize();

      expect(session.isInitialized).toBe(true);
      expect(handler).toHaveBeenCalledWith(false); // no stored auth
    });

    it('restores session from storage', async () => {
      const { session, storage, events } = createDeps();
      const jwt = futureJwt();
      const authData = mockAuthResponse({ jwtToken: jwt });

      // Pre-populate storage
      await storage.setItem('ww_user', JSON.stringify(authData));
      await storage.setItem('ww_accessToken', jwt);

      const handler = vi.fn();
      events.on('sessionInitialized', handler);

      await session.initialize();

      expect(session.isAuthenticated).toBe(true);
      expect(session.accessToken).toBe(jwt);
      expect(session.userId).toBe('user-1');
      expect(handler).toHaveBeenCalledWith(true);
    });

    it('clears expired session on init', async () => {
      const { session, storage, events } = createDeps();
      const expiredMs = Date.now() - 1000; // already expired

      await storage.setItem('ww_session_expiry', String(expiredMs));
      await storage.setItem('ww_session_auth', '{}');

      const handler = vi.fn();
      events.on('sessionExpired', handler);

      await session.initialize();

      expect(session.isAuthenticated).toBe(false);
      expect(handler).toHaveBeenCalled();
    });

    it('only initializes once', async () => {
      const { session, events } = createDeps();
      const handler = vi.fn();
      events.on('sessionInitialized', handler);

      await session.initialize();
      await session.initialize();

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------

  describe('login', () => {
    it('stores session data on login', async () => {
      const { session, storage } = createDeps();
      const authResp = mockAuthResponse();

      const result = await session.login(authResp);

      expect(result).toBe(true);
      expect(session.isAuthenticated).toBe(true);
      expect(session.user).not.toBeNull();
      expect(await storage.getItem('ww_session_expiry')).not.toBeNull();
    });

    it('returns false for empty auth response', async () => {
      const { session } = createDeps();

      const result = await session.login(mockAuthResponse({ jwtToken: '' }));

      expect(result).toBe(false);
    });

    it('sets session expiry based on config', async () => {
      const { session, storage } = createDeps({ sessionExpirationMinutes: 30 });

      await session.login(mockAuthResponse());

      const expiry = Number(await storage.getItem('ww_session_expiry'));
      const expectedExpiry = Date.now() + 30 * 60 * 1000;
      expect(expiry).toBeCloseTo(expectedExpiry, -2); // within ~100ms
    });
  });

  // -------------------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------------------

  describe('logout', () => {
    it('clears session state', async () => {
      const { session } = createDeps();
      await session.login(mockAuthResponse());
      expect(session.isAuthenticated).toBe(true);

      await session.logout();

      expect(session.isAuthenticated).toBe(false);
      expect(session.accessToken).toBeNull();
      expect(session.user).toBeNull();
    });

    it('clears session storage', async () => {
      const { session, storage } = createDeps();
      await session.login(mockAuthResponse());

      await session.logout();

      expect(await storage.getItem('ww_session_auth')).toBeNull();
      expect(await storage.getItem('ww_session_expiry')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Session Expiry
  // -------------------------------------------------------------------------

  describe('session expiry', () => {
    it('returns null access token when session expired', async () => {
      const { session } = createDeps({ sessionExpirationMinutes: 1 });
      await session.login(mockAuthResponse());
      expect(session.accessToken).not.toBeNull();

      // Advance time past expiry
      vi.advanceTimersByTime(2 * 60 * 1000);

      expect(session.accessToken).toBeNull();
      expect(session.isAuthenticated).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Sliding Expiration
  // -------------------------------------------------------------------------

  describe('touchSession', () => {
    it('extends session expiry', async () => {
      const { session, storage } = createDeps({ sessionExpirationMinutes: 60 });
      await session.login(mockAuthResponse());

      const originalExpiry = Number(await storage.getItem('ww_session_expiry'));

      // Advance 30 minutes
      vi.advanceTimersByTime(30 * 60 * 1000);

      await session.touchSession();

      const newExpiry = Number(await storage.getItem('ww_session_expiry'));
      expect(newExpiry).toBeGreaterThan(originalExpiry);
    });

    it('does not extend when slidingExpiration is false', async () => {
      const { session, storage } = createDeps({
        sessionExpirationMinutes: 60,
        slidingExpiration: false,
      });
      await session.login(mockAuthResponse());

      const originalExpiry = Number(await storage.getItem('ww_session_expiry'));

      vi.advanceTimersByTime(30 * 60 * 1000);
      await session.touchSession();

      const newExpiry = Number(await storage.getItem('ww_session_expiry'));
      expect(newExpiry).toBe(originalExpiry);
    });
  });

  // -------------------------------------------------------------------------
  // Token Refresh
  // -------------------------------------------------------------------------

  describe('refreshToken', () => {
    it('returns false when auto-refresh is disabled', async () => {
      const { session } = createDeps({ enableAutoTokenRefresh: false });
      await session.login(mockAuthResponse());

      const result = await session.refreshToken();
      expect(result).toBe(false);
    });

    it('returns false when not authenticated', async () => {
      const { session } = createDeps({ enableAutoTokenRefresh: true });

      const result = await session.refreshToken();
      expect(result).toBe(false);
    });

    it('deduplicates concurrent refresh calls', async () => {
      const { session, fetchSpy, storage } = createDeps({ enableAutoTokenRefresh: true });
      await session.login(mockAuthResponse());

      // Store refresh token so authService.refreshToken works
      await storage.setItem('ww_refreshToken', 'refresh-token');

      const newAuth = mockAuthResponse({ jwtToken: futureJwt(), refreshToken: 'new-refresh' });
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(newAuth), {
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
        }),
      );

      // Fire two refresh calls concurrently
      const [r1, r2] = await Promise.all([session.refreshToken(), session.refreshToken()]);

      expect(r1).toBe(true);
      expect(r2).toBe(true);
      // Only one actual fetch call should have been made
      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it('skips refresh if recently refreshed', async () => {
      const { session, fetchSpy, storage } = createDeps({ enableAutoTokenRefresh: true });
      await session.login(mockAuthResponse());
      await storage.setItem('ww_refreshToken', 'refresh-token');

      // First refresh
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockAuthResponse()), {
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
        }),
      );
      await session.refreshToken();

      // Second refresh within 30s window
      vi.advanceTimersByTime(5000); // only 5s later
      const result = await session.refreshToken();

      expect(result).toBe(true); // returns true (recently refreshed)
      expect(fetchSpy).toHaveBeenCalledOnce(); // no additional fetch
    });
  });

  // -------------------------------------------------------------------------
  // Dispose
  // -------------------------------------------------------------------------

  describe('dispose', () => {
    it('stops refresh timer on dispose', async () => {
      const { session } = createDeps({ enableAutoTokenRefresh: true });
      await session.login(mockAuthResponse());

      session.dispose();

      // Should not throw or leak timers
      expect(session.isAuthenticated).toBe(true); // state isn't cleared, just timers
    });

    it('is idempotent', () => {
      const { session } = createDeps();
      session.dispose();
      session.dispose(); // should not throw
    });
  });

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  describe('getters', () => {
    it('returns user properties', async () => {
      const { session } = createDeps();
      const authResp = mockAuthResponse({ userId: 'u-42', email: 'test@test.com' });

      await session.login(authResp);

      expect(session.userId).toBe('u-42');
      expect(session.userEmail).toBe('test@test.com');
    });

    it('returns null for user properties when not authenticated', () => {
      const { session } = createDeps();

      expect(session.userId).toBeNull();
      expect(session.userEmail).toBeNull();
      expect(session.user).toBeNull();
    });
  });
});
