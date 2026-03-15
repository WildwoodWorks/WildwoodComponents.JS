// External API client — makes authenticated fetch calls to the app's OWN backend
// using the Wildwood session token. This eliminates the need for apps to manually
// read from localStorage or duplicate token injection logic.

import type { SessionManager } from '../auth/sessionManager.js';

export interface ExternalApiClientOptions {
  /** Base URL of the external API (e.g. 'https://api.myapp.com' or '/api') */
  baseUrl: string;
  /** Default headers to include on every request */
  defaultHeaders?: Record<string, string>;
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

export interface ExternalApiRequestOptions {
  /** Additional headers for this request */
  headers?: Record<string, string>;
  /** Skip attaching the auth token (default: false) */
  skipAuth?: boolean;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Request timeout override in milliseconds */
  timeoutMs?: number;
}

export interface ExternalApiClient {
  /** GET request */
  get: <T = unknown>(path: string, options?: ExternalApiRequestOptions) => Promise<T>;
  /** POST request */
  post: <T = unknown>(path: string, body?: unknown, options?: ExternalApiRequestOptions) => Promise<T>;
  /** PUT request */
  put: <T = unknown>(path: string, body?: unknown, options?: ExternalApiRequestOptions) => Promise<T>;
  /** DELETE request */
  del: <T = unknown>(path: string, options?: ExternalApiRequestOptions) => Promise<T>;
  /** PATCH request */
  patch: <T = unknown>(path: string, body?: unknown, options?: ExternalApiRequestOptions) => Promise<T>;
  /** Raw fetch with auth token attached */
  fetch: (path: string, init?: RequestInit & { skipAuth?: boolean }) => Promise<Response>;
}

/**
 * Creates a fetch-based HTTP client that auto-attaches the current Wildwood
 * session token to requests. Use this for calling your app's own API endpoints
 * (not the Wildwood API — that's handled by the SDK's built-in HttpClient).
 *
 * @example
 * const api = createExternalApiClient(client.session, {
 *   baseUrl: 'https://api.myapp.com',
 * });
 *
 * const providers = await api.get('/providers');
 * await api.post('/providers', { name: 'New Provider' });
 */
export function createExternalApiClient(session: SessionManager, options: ExternalApiClientOptions): ExternalApiClient {
  const { baseUrl, defaultHeaders = {}, timeoutMs: defaultTimeout = 30_000 } = options;

  // Normalize base URL — strip trailing slash
  const base = baseUrl.replace(/\/+$/, '');

  async function doFetch(path: string, init: RequestInit & { skipAuth?: boolean } = {}): Promise<Response> {
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

    const headers: Record<string, string> = {
      ...defaultHeaders,
      ...((init.headers as Record<string, string>) ?? {}),
    };

    // Attach Wildwood session token unless opted out
    if (!init.skipAuth) {
      const token = session.accessToken;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    // Timeout support via AbortController
    const timeout = (init as ExternalApiRequestOptions).timeoutMs ?? defaultTimeout;
    const controller = new AbortController();
    const existingSignal = init.signal;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Combine existing signal with timeout
    if (existingSignal) {
      if (existingSignal.aborted) {
        controller.abort();
      } else {
        existingSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    try {
      return await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function jsonRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: ExternalApiRequestOptions,
  ): Promise<T> {
    const headers: Record<string, string> = { ...options?.headers };
    const init: RequestInit & ExternalApiRequestOptions = {
      method,
      headers,
      skipAuth: options?.skipAuth,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const response = await doFetch(path, init);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new ExternalApiError(response.status, response.statusText, errorBody, path);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  return {
    get: <T = unknown>(path: string, opts?: ExternalApiRequestOptions) => jsonRequest<T>('GET', path, undefined, opts),
    post: <T = unknown>(path: string, body?: unknown, opts?: ExternalApiRequestOptions) =>
      jsonRequest<T>('POST', path, body, opts),
    put: <T = unknown>(path: string, body?: unknown, opts?: ExternalApiRequestOptions) =>
      jsonRequest<T>('PUT', path, body, opts),
    del: <T = unknown>(path: string, opts?: ExternalApiRequestOptions) =>
      jsonRequest<T>('DELETE', path, undefined, opts),
    patch: <T = unknown>(path: string, body?: unknown, opts?: ExternalApiRequestOptions) =>
      jsonRequest<T>('PATCH', path, body, opts),
    fetch: doFetch,
  };
}

export class ExternalApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
    public readonly path: string,
  ) {
    super(`External API error ${status} ${statusText} from ${path}`);
    this.name = 'ExternalApiError';
  }
}
