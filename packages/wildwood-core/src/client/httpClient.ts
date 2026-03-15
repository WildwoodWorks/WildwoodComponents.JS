// HTTP client - fetch wrapper with auth headers, retry, timeout, interceptors
// Mirrors WildwoodComponents.Blazor DelegatingHandler pattern
// Includes reactive 401 handling: on 401, refresh token and retry once (Blazor parity)

import type { WildwoodConfig, RequestOptions, ApiResponse, RequestInterceptor, ResponseInterceptor } from './types.js';
import { WildwoodError } from './errors.js';

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
    const maxAttempts = this.config.enableRetry !== false ? (this.config.maxRetryAttempts ?? 3) : 1;

    let lastError: WildwoodError | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await this.executeRequest<T>(method, url, body, options, timeoutMs);
        return result;
      } catch (err) {
        lastError =
          err instanceof WildwoodError
            ? err
            : new WildwoodError(err instanceof Error ? err.message : String(err), 0, 'NetworkError');

        // Reactive 401 handling: refresh token and retry once (Blazor parity)
        if (lastError.status === 401 && !options?.skipAuth && this.on401Refresh && attempt === 0) {
          const refreshed = await this.on401Refresh();
          if (refreshed) {
            // Retry with new token - go to next loop iteration
            continue;
          }
        }

        // Only retry on 5xx or network errors, not 4xx
        if (lastError.status && lastError.status < 500) throw lastError;
        if (attempt < maxAttempts - 1) {
          await this.delay(Math.min(1000 * Math.pow(2, attempt), 10000));
        }
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

    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

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
