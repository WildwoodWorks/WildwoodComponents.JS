// Backend-connected notification inbox service — client for WildwoodAPI's
// api/notifications surface (list, unread count, mark read, delete, per-app
// delivery preferences).
//
// Same transport idiom as DocumentService: raw fetch with explicit auth headers
// (user JWT + X-API-Key), per-call apiBaseUrl override, and one-shot 401
// sessionExpired signaling. Notifications are tenant/user-scoped server-side via
// the caller's JWT claims.
//
// NOTE: this is the SEPARATE persisted inbox — not the in-memory toast queue in
// ./notificationService.ts (NotificationService). The WildwoodClient wires this
// as `notificationInbox`; `notifications` remains the toast service.

import type { WildwoodConfig } from '../client/types.js';
import type { WildwoodEventEmitter } from '../events/eventEmitter.js';
import type { AppNotification, UserNotificationPreference } from './inboxTypes.js';
import { createDefaultNotificationPreference } from './inboxTypes.js';

export interface NotificationInboxRequestOptions {
  /** Override the API base INCLUDING the /api segment (e.g. "https://host/api"). Defaults to config.baseUrl + "/api". */
  apiBaseUrl?: string;
  signal?: AbortSignal;
  /** Injectable for testing. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export class NotificationInboxService {
  /** Token the one-shot 401 signal last fired for; re-armed when the token changes. */
  private lastAuthFailureToken: string | undefined;

  constructor(
    private config: WildwoodConfig,
    private events: WildwoodEventEmitter,
    private getAccessToken: () => string | null,
  ) {}

  /**
   * All inbox notifications for the authenticated user.
   * - Returns `[]` on the graceful-empty paths (401 auth failure, 403 feature not on tier).
   * - Returns `null` on a TRANSIENT failure (HTTP 5xx / non-ok / network error) so callers
   *   can retain the last good list instead of clobbering it with an empty array.
   */
  async list(options?: NotificationInboxRequestOptions): Promise<AppNotification[] | null> {
    try {
      const response = await this.fetch(options)(this.url('', options), {
        headers: this.buildHeaders({ Accept: 'application/json' }),
        signal: options?.signal,
      });
      // 401 (sessionExpired fired) / 403 (feature off): valid "no notifications" outcome.
      if (!this.ensureAuthorized(response.status)) return [];
      // Anything else non-ok is transient — signal retain, don't wipe the list.
      if (!response.ok) return null;
      return ((await response.json()) as AppNotification[]) ?? [];
    } catch (err) {
      console.warn('[NotificationInboxService] Failed to list notifications:', err);
      return null;
    }
  }

  /**
   * Count of unread notifications.
   * - Returns `0` on the graceful-empty paths (401 auth failure, 403 feature not on tier).
   * - Returns `null` on a TRANSIENT failure (HTTP 5xx / non-ok / network error) so callers
   *   can keep the last known count instead of dropping the badge to 0 on a blip.
   */
  async getUnreadCount(options?: NotificationInboxRequestOptions): Promise<number | null> {
    try {
      const response = await this.fetch(options)(this.url('/count', options), {
        headers: this.buildHeaders({ Accept: 'application/json' }),
        signal: options?.signal,
      });
      if (!this.ensureAuthorized(response.status)) return 0;
      if (!response.ok) return null;
      const value = (await response.json()) as unknown;
      const count = Number(value);
      return Number.isFinite(count) ? count : 0;
    } catch (err) {
      console.warn('[NotificationInboxService] Failed to load unread count:', err);
      return null;
    }
  }

  /** Marks a single notification read. Returns whether the server acknowledged. */
  async markRead(id: string, options?: NotificationInboxRequestOptions): Promise<boolean> {
    try {
      const response = await this.fetch(options)(this.url(`/${encodeURIComponent(id)}/read`, options), {
        method: 'PUT',
        headers: this.buildHeaders({}),
        signal: options?.signal,
      });
      if (!this.ensureAuthorized(response.status)) return false;
      return response.ok;
    } catch (err) {
      console.warn('[NotificationInboxService] Failed to mark notification read:', err);
      return false;
    }
  }

  /** Marks every unread notification read. Returns how many were marked (0 on failure). */
  async markAllRead(options?: NotificationInboxRequestOptions): Promise<number> {
    try {
      const response = await this.fetch(options)(this.url('/read-all', options), {
        method: 'PUT',
        headers: this.buildHeaders({ Accept: 'application/json' }),
        signal: options?.signal,
      });
      if (!this.ensureAuthorized(response.status) || !response.ok) return 0;
      const body = (await response.json().catch(() => ({}))) as { markedAsRead?: number };
      return body?.markedAsRead ?? 0;
    } catch (err) {
      console.warn('[NotificationInboxService] Failed to mark all notifications read:', err);
      return 0;
    }
  }

  /** Deletes (dismisses) a notification. Returns whether the server acknowledged. */
  async remove(id: string, options?: NotificationInboxRequestOptions): Promise<boolean> {
    try {
      const response = await this.fetch(options)(this.url(`/${encodeURIComponent(id)}`, options), {
        method: 'DELETE',
        headers: this.buildHeaders({}),
        signal: options?.signal,
      });
      if (!this.ensureAuthorized(response.status)) return false;
      return response.ok;
    } catch (err) {
      console.warn('[NotificationInboxService] Failed to delete notification:', err);
      return false;
    }
  }

  /**
   * The user's delivery preferences for an app.
   * - Returns the safe DEFAULT preference on the graceful-deny paths (401 auth failure —
   *   sessionExpired still fires once; 403 feature-off) so a real deny yields usable
   *   defaults, not stale values.
   * - Returns `null` on a TRANSIENT failure (HTTP 5xx / non-ok / network error) so callers
   *   can retain the previously-loaded preferences instead of resetting them to defaults.
   */
  async getPreferences(
    appId: string,
    options?: NotificationInboxRequestOptions,
  ): Promise<UserNotificationPreference | null> {
    try {
      const query = `?appId=${encodeURIComponent(appId)}`;
      const response = await this.fetch(options)(this.url(`/preferences${query}`, options), {
        headers: this.buildHeaders({ Accept: 'application/json' }),
        signal: options?.signal,
      });
      // 401 (sessionExpired fired) / 403 (feature off): a legitimate deny — safe defaults.
      if (!this.ensureAuthorized(response.status)) return createDefaultNotificationPreference(appId);
      // Anything else non-ok is transient — signal retain (null), don't reset to defaults.
      if (!response.ok) return null;
      return (await response.json()) as UserNotificationPreference;
    } catch (err) {
      console.warn('[NotificationInboxService] Failed to load preferences:', err);
      return null;
    }
  }

  /** Persists delivery preferences. Returns the saved record, or null on failure. */
  async updatePreferences(
    pref: UserNotificationPreference,
    options?: NotificationInboxRequestOptions,
  ): Promise<UserNotificationPreference | null> {
    try {
      const response = await this.fetch(options)(this.url('/preferences', options), {
        method: 'PUT',
        headers: this.buildHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify(pref),
        signal: options?.signal,
      });
      if (!this.ensureAuthorized(response.status) || !response.ok) return null;
      return (await response.json()) as UserNotificationPreference;
    } catch (err) {
      console.warn('[NotificationInboxService] Failed to update preferences:', err);
      return null;
    }
  }

  // ------------------------------------------------------------------

  private ensureAuthorized(status: number): boolean {
    // 401 = authentication failure (one-shot sessionExpired per token);
    // 403 = permission/feature denial (e.g. tier lacks NOTIFICATIONS) — the token
    // is valid, so no session-expiry signal, and callers degrade gracefully.
    if (status === 401) {
      const token = this.getAccessToken() ?? '';
      if (this.lastAuthFailureToken !== token) {
        this.lastAuthFailureToken = token;
        this.events.emit('sessionExpired');
      }
      return false;
    }
    return status !== 403;
  }

  private buildHeaders(extra: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.config.apiKey) headers['X-API-Key'] = this.config.apiKey;
    const token = this.getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  private fetch(options?: NotificationInboxRequestOptions): typeof fetch {
    return options?.fetchImpl ?? globalThis.fetch;
  }

  private url(path: string, options?: NotificationInboxRequestOptions): string {
    const base = options?.apiBaseUrl
      ? options.apiBaseUrl.replace(/\/+$/, '')
      : `${this.config.baseUrl.replace(/\/+$/, '')}/api`;
    return `${base}/notifications${path}`;
  }
}
