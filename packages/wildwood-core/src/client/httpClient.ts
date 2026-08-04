// HTTP client - fetch wrapper with auth headers, retry, timeout, interceptors
// Mirrors WildwoodComponents.Blazor DelegatingHandler pattern
// Includes reactive 401 handling: on 401, refresh token and retry once (Blazor parity)

import type { WildwoodConfig, RequestOptions, ApiResponse, RequestInterceptor, ResponseInterceptor } from './types.js';
import { WildwoodError } from './errors.js';

/**
 * HTTP methods that may be replayed without changing the outcome (RFC 9110 §9.2.2).
 *
 * PUT and DELETE qualify: both describe an end state, so applying them twice lands where applying
 * them once did. POST and PATCH do not — each is a fresh instruction to the server.
 */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

function isIdempotent(method: string): boolean {
  return IDEMPOTENT_METHODS.has(method.toUpperCase());
}

/**
 * Whether a rejection came from an AbortController.
 *
 * Matched by `name`, not by message: the message is browser-specific ("The operation was aborted.",
 * "The user aborted a request.", "signal is aborted without reason") while the name is `AbortError`
 * everywhere. Node's fetch rejects with a TypeError whose `cause` is the AbortError, so the cause
 * is unwrapped one level too.
 */
function isAbortError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { name, cause } = err as { name?: unknown; cause?: unknown };
  if (name === 'AbortError' || name === 'TimeoutError') return true;
  return cause !== undefined && cause !== err && isAbortError(cause);
}

export class HttpClient {
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private getAccessToken: (() => Promise<string | null>) | null = null;
  private on401Refresh: (() => Promise<boolean>) | null = null;

  constructor(private config: WildwoodConfig) {}

  /** Set the function that provides the current access token */
  setTokenProvider(provider: () => Promise<string | null>): void {
    this.getAccessToken = provider;
  }

  /** Set the function that handles 401 retry (refreshes token, returns true if refreshed) */
  setOn401Refresh(handler: () => Promise<boolean>): void {
    this.on401Refresh = handler;
  }

  /** Add a request interceptor (returns unsubscribe function) */
  addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      const idx = this.requestInterceptors.indexOf(interceptor);
      if (idx >= 0) this.requestInterceptors.splice(idx, 1);
    };
  }

  /** Add a response interceptor (returns unsubscribe function) */
  addResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      const idx = this.responseInterceptors.indexOf(interceptor);
      if (idx >= 0) this.responseInterceptors.splice(idx, 1);
    };
  }

  async get<T = unknown>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  async put<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body, options);
  }

  async delete<T = unknown>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  private joinUrl(base: string, path: string): string {
    const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    const url = this.joinUrl(this.config.baseUrl, path);
    const timeoutMs = (options?.timeout ?? this.config.requestTimeoutSeconds ?? 30) * 1000;
    // Clamped the way WildwoodCore's `max(1, ...)` is: a zero, negative, or non-finite value
    // would otherwise leave the loop below with no reachable exit.
    const configuredAttempts = this.config.enableRetry !== false ? (this.config.maxRetryAttempts ?? 3) : 1;
    const maxAttempts = Number.isFinite(configuredAttempts) ? Math.max(1, Math.trunc(configuredAttempts)) : 1;

    let lastError: WildwoodError | null = null;
    let attemptsUsed = 0;
    let refreshReplayUsed = false;

    for (;;) {
      try {
        const result = await this.executeRequest<T>(method, url, body, options, timeoutMs);
        return result;
      } catch (err) {
        lastError =
          err instanceof WildwoodError
            ? err
            : new WildwoodError(err instanceof Error ? err.message : String(err), 0, 'NetworkError');

        // Reactive 401 handling: refresh token and replay once (Blazor parity).
        // Safe for every method, unlike the retries below: a 401 is refused by auth middleware
        // before the handler runs, so the request provably had no effect.
        //
        // Deliberately outside the retry budget below. Recovering an expired session is not a
        // retry, and counting it as one meant `enableRetry: false` — or any maxRetryAttempts of
        // 1 — spent the refresh and then threw the original 401 without ever replaying, leaving
        // the caller signed out with a fresh token in hand. The `refreshReplayUsed` flag, not
        // the attempt index, is what keeps this to a single refresh per request.
        if (!refreshReplayUsed && lastError.status === 401 && !options?.skipAuth && this.on401Refresh) {
          const refreshed = await this.on401Refresh();
          if (refreshed) {
            refreshReplayUsed = true;
            // Retry with new token - go to next loop iteration
            continue;
          }
        }

        // Never retried, for any method. A cancel was the caller's explicit instruction, and a
        // timeout says nothing about whether the server processed the request — only that we
        // stopped waiting for the answer.
        if (lastError.code === 'Timeout' || lastError.code === 'Cancelled') throw lastError;

        // Only retry on 5xx or network errors, not 4xx
        if (lastError.status && lastError.status < 500) throw lastError;

        // ...and only for methods that are safe to replay. Neither a network error nor a 5xx tells
        // us whether the server already applied the request, so replaying a POST can duplicate the
        // effect. That is not hypothetical: with the default 30s timeout and 3 attempts, one slow
        // feedback submit filed the feedback three times, because the row commits server-side
        // before the response is produced.
        //
        // Callers who know a specific POST is safe to replay can retry it themselves; the client
        // cannot know that on their behalf.
        if (!isIdempotent(method)) throw lastError;

        attemptsUsed++;
        if (attemptsUsed >= maxAttempts) break;

        await this.delay(Math.min(1000 * Math.pow(2, attemptsUsed - 1), 10000));
      }
    }

    throw lastError!;
  }

  private async executeRequest<T>(
    method: string,
    url: string,
    body?: unknown,
    options?: RequestOptions,
    timeoutMs?: number,
  ): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const signal = options?.signal ? this.combineSignals(options.signal, controller.signal) : controller.signal;

    // Recorded so the rejection can be told apart from a caller-initiated abort: both surface as
    // the same DOMException, and only this flag knows which one fired.
    let timedOut = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : undefined;

    try {
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

      let init: RequestInit = {
        method,
        headers: {
          // Don't set Content-Type for FormData — browser sets it with boundary
          ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
          ...(this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {}),
          ...options?.headers,
        },
        signal,
        body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
      };

      // Inject auth token
      if (!options?.skipAuth && this.getAccessToken) {
        const token = await this.getAccessToken();
        if (token) {
          (init.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
        }
      }

      // Run request interceptors
      for (const interceptor of this.requestInterceptors) {
        init = await interceptor(url, init);
      }

      const startTime = performance.now();
      const response = await fetch(url, init);
      const durationMs = performance.now() - startTime;

      // Run response interceptors
      for (const interceptor of this.responseInterceptors) {
        await interceptor(url, response, durationMs);
      }

      if (!response.ok) {
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text().catch(() => null);
        }

        console.error(`[HttpClient] ${response.status} ${response.statusText} for ${url}`, errorBody);
        throw WildwoodError.fromResponse(response.status, errorBody, response.statusText);
      }

      const contentType = response.headers.get('content-type');
      let data: T;
      if (contentType?.includes('application/json')) {
        data = (await response.json()) as T;
      } else if (response.status === 204) {
        data = undefined as T;
      } else if (
        contentType?.includes('application/octet-stream') ||
        contentType?.includes('image/') ||
        contentType?.includes('audio/') ||
        contentType?.includes('video/') ||
        options?.responseType === 'arraybuffer'
      ) {
        data = (await response.arrayBuffer()) as T;
      } else {
        data = (await response.text()) as T;
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return { data, status: response.status, headers };
    } catch (err) {
      // Translated here rather than left raw, because the browser's own text is both
      // implementation-specific and useless to a user: Firefox says "The operation was aborted.",
      // Chrome "signal is aborted without reason". Neither mentions the timeout that actually
      // fired, so that message ended up in front of people who submitted feedback.
      if (isAbortError(err)) {
        // `timedOut` is authoritative for our own timer; the name check covers a runtime that
        // surfaces a deadline as TimeoutError without going through it.
        const fromTimeout = timedOut || (err as { name?: unknown }).name === 'TimeoutError';
        throw fromTimeout
          ? new WildwoodError(`Request timed out after ${timeoutMs}ms`, 0, 'Timeout')
          : new WildwoodError('Request was cancelled', 0, 'Cancelled');
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    a.addEventListener('abort', onAbort, { once: true });
    b.addEventListener('abort', onAbort, { once: true });
    if (a.aborted || b.aborted) controller.abort();
    return controller.signal;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
