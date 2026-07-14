// AI Flow subscription service — client for WildwoodAPI's app-facing
// flow-subscription surface (api/ai/flows/subscriptions): a user's standing
// orders for scheduled runs of published flows. getLatestRun returns the last
// scheduled run's full detail (including outputJson) so a client can sync a
// fresh result after a completion notification.
//
// Same transport idiom as DocumentService/AIFlowService: raw fetch with
// explicit auth headers, per-call apiBaseUrl/appId overrides, and one-shot 401
// sessionExpired signaling. Unlike AIFlowService this service does no SSE and
// no 401 refresh-and-retry — every call is a plain JSON request/response.

import type { WildwoodConfig } from '../client/types.js';
import type { WildwoodEventEmitter } from '../events/eventEmitter.js';
import type {
  AIFlowRunDetail,
  AIFlowSubscription,
  AIFlowSubscriptionCreateRequest,
  AIFlowSubscriptionUpdateRequest,
} from './types.js';

export interface AIFlowSubscriptionRequestOptions {
  /** Override the API base INCLUDING the /api segment (e.g. "https://host/api"). Defaults to config.baseUrl + "/api". */
  apiBaseUrl?: string;
  /** Override the app whose subscriptions are targeted (sent as ?requestedAppId=). Defaults to config.appId. */
  appId?: string;
  signal?: AbortSignal;
  /** Injectable for testing. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export class AIFlowSubscriptionService {
  /** Token the one-shot 401 signal last fired for; re-armed when the token changes. */
  private lastAuthFailureToken: string | undefined;

  /** Non-null after a 429 create failure — the server's limit message (upgrade CTA copy). */
  lastLimitMessage: string | null = null;

  constructor(
    private config: WildwoodConfig,
    private events: WildwoodEventEmitter,
    private getAccessToken: () => string | null,
  ) {}

  async getSubscriptions(options?: AIFlowSubscriptionRequestOptions): Promise<AIFlowSubscription[]> {
    try {
      const response = await this.fetch(options)(this.url('', options), {
        headers: this.buildHeaders({ Accept: 'application/json' }),
        signal: options?.signal,
      });
      if (!this.ensureAuthorized(response.status) || !response.ok) return [];
      return ((await response.json()) as AIFlowSubscription[]) ?? [];
    } catch (err) {
      console.warn('[AIFlowSubscriptionService] Failed to load flow subscriptions:', err);
      return [];
    }
  }

  /**
   * Creates a standing order. Returns the created subscription, or null on
   * failure. A 429 (plan limit reached) sets `lastLimitMessage` to the server's
   * upgrade copy and returns null — the field is reset to null at the start of
   * every create call.
   */
  async create(
    request: AIFlowSubscriptionCreateRequest,
    options?: AIFlowSubscriptionRequestOptions,
  ): Promise<AIFlowSubscription | null> {
    this.lastLimitMessage = null;
    try {
      const response = await this.fetch(options)(this.url('', options), {
        method: 'POST',
        headers: this.buildHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify(request),
        signal: options?.signal,
      });
      if (!this.ensureAuthorized(response.status)) return null;
      if (response.status === 429) {
        this.lastLimitMessage = await this.extractLimitMessage(response);
        return null;
      }
      if (!response.ok) return null;
      return (await response.json()) as AIFlowSubscription;
    } catch (err) {
      console.warn('[AIFlowSubscriptionService] Failed to create flow subscription:', err);
      return null;
    }
  }

  async update(
    subscriptionId: string,
    request: AIFlowSubscriptionUpdateRequest,
    options?: AIFlowSubscriptionRequestOptions,
  ): Promise<AIFlowSubscription | null> {
    try {
      const response = await this.fetch(options)(this.url(`/${encodeURIComponent(subscriptionId)}`, options), {
        method: 'PUT',
        headers: this.buildHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify(request),
        signal: options?.signal,
      });
      if (!this.ensureAuthorized(response.status) || !response.ok) return null;
      return (await response.json()) as AIFlowSubscription;
    } catch (err) {
      console.warn('[AIFlowSubscriptionService] Failed to update flow subscription:', err);
      return null;
    }
  }

  /** Enables/disables the standing order (POST .../enable | .../disable, no body). */
  async setEnabled(
    subscriptionId: string,
    enabled: boolean,
    options?: AIFlowSubscriptionRequestOptions,
  ): Promise<AIFlowSubscription | null> {
    try {
      const action = enabled ? 'enable' : 'disable';
      const response = await this.fetch(options)(
        this.url(`/${encodeURIComponent(subscriptionId)}/${action}`, options),
        {
          method: 'POST',
          headers: this.buildHeaders({ Accept: 'application/json' }),
          signal: options?.signal,
        },
      );
      if (!this.ensureAuthorized(response.status) || !response.ok) return null;
      return (await response.json()) as AIFlowSubscription;
    } catch (err) {
      console.warn('[AIFlowSubscriptionService] Failed to set flow subscription enabled state:', err);
      return null;
    }
  }

  async delete(subscriptionId: string, options?: AIFlowSubscriptionRequestOptions): Promise<boolean> {
    try {
      const response = await this.fetch(options)(this.url(`/${encodeURIComponent(subscriptionId)}`, options), {
        method: 'DELETE',
        headers: this.buildHeaders({}),
        signal: options?.signal,
      });
      if (!this.ensureAuthorized(response.status)) return false;
      return response.ok;
    } catch (err) {
      console.warn('[AIFlowSubscriptionService] Failed to delete flow subscription:', err);
      return false;
    }
  }

  /**
   * Full detail of the subscription's most recent scheduled run (including
   * outputJson), or null when there is none yet (404) or on failure.
   */
  async getLatestRun(
    subscriptionId: string,
    options?: AIFlowSubscriptionRequestOptions,
  ): Promise<AIFlowRunDetail | null> {
    try {
      const response = await this.fetch(options)(
        this.url(`/${encodeURIComponent(subscriptionId)}/latest-run`, options),
        {
          headers: this.buildHeaders({ Accept: 'application/json' }),
          signal: options?.signal,
        },
      );
      if (!this.ensureAuthorized(response.status)) return null;
      if (response.status === 404) return null;
      if (!response.ok) return null;
      return (await response.json()) as AIFlowRunDetail;
    } catch (err) {
      console.warn('[AIFlowSubscriptionService] Failed to load latest run:', err);
      return null;
    }
  }

  // ------------------------------------------------------------------

  private async extractLimitMessage(response: Response): Promise<string> {
    const fallback = "Your plan's favorites limit has been reached.";
    try {
      const body = (await response.json()) as { message?: string };
      return body?.message || fallback;
    } catch {
      return fallback;
    }
  }

  private ensureAuthorized(status: number): boolean {
    // 401 = authentication failure (one-shot sessionExpired per token);
    // 403 = permission/feature denial (e.g. tier lacks FLOW_SUBSCRIPTIONS) — the
    // token is valid, so no session-expiry signal.
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

  private fetch(options?: AIFlowSubscriptionRequestOptions): typeof fetch {
    return options?.fetchImpl ?? globalThis.fetch;
  }

  private url(path: string, options?: AIFlowSubscriptionRequestOptions): string {
    const base = options?.apiBaseUrl
      ? options.apiBaseUrl.replace(/\/+$/, '')
      : `${this.config.baseUrl.replace(/\/+$/, '')}/api`;
    const appId = options?.appId ?? this.config.appId;
    const query = appId ? `?requestedAppId=${encodeURIComponent(appId)}` : '';
    return `${base}/ai/flows/subscriptions${path}${query}`;
  }
}
