import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '../client/httpClient.js';
import { WildwoodError } from '../client/errors.js';
import type { WildwoodConfig } from '../client/types.js';

function createConfig(overrides?: Partial<WildwoodConfig>): WildwoodConfig {
  return {
    baseUrl: 'https://api.example.com',
    enableRetry: false,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  const h = new Headers({ 'content-type': 'application/json', ...headers });
  return new Response(JSON.stringify(body), { status, headers: h });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: new Headers({ 'content-type': 'text/plain' }) });
}

describe('HttpClient', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Basic HTTP methods
  // -------------------------------------------------------------------------

  it('sends GET request with correct URL', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new HttpClient(createConfig());

    const result = await client.get<{ ok: boolean }>('api/test');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.example.com/api/test');
    expect(result.data).toEqual({ ok: true });
    expect(result.status).toBe(200);
  });

  it('sends POST request with JSON body', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 1 }, 201));
    const client = new HttpClient(createConfig());

    const result = await client.post<{ id: number }>('api/items', { name: 'test' });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'test' }));
    expect(result.data).toEqual({ id: 1 });
    expect(result.status).toBe(201);
  });

  it('sends PUT request', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ updated: true }));
    const client = new HttpClient(createConfig());

    await client.put('api/items/1', { name: 'updated' });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.method).toBe('PUT');
  });

  it('sends DELETE request without body', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new HttpClient(createConfig());

    await client.delete('api/items/1');

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // URL joining
  // -------------------------------------------------------------------------

  it('handles baseUrl with trailing slash', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    const client = new HttpClient(createConfig({ baseUrl: 'https://api.example.com/' }));

    await client.get('api/test');

    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.example.com/api/test');
  });

  it('handles path with leading slash', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    const client = new HttpClient(createConfig());

    await client.get('/api/test');

    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.example.com/api/test');
  });

  // -------------------------------------------------------------------------
  // Auth token injection
  // -------------------------------------------------------------------------

  it('injects authorization header from token provider', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    const client = new HttpClient(createConfig());
    client.setTokenProvider(async () => 'my-jwt-token');

    await client.get('api/secure');

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer my-jwt-token');
  });

  it('skips auth header when skipAuth is true', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    const client = new HttpClient(createConfig());
    client.setTokenProvider(async () => 'my-jwt-token');

    await client.get('api/public', { skipAuth: true });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('sends API key header when configured', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    const client = new HttpClient(createConfig({ apiKey: 'secret-key' }));

    await client.get('api/test');

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers['X-API-Key']).toBe('secret-key');
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it('throws WildwoodError on 4xx response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Not found' }), {
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );
    const client = new HttpClient(createConfig());

    await expect(client.get('api/missing')).rejects.toThrow(WildwoodError);
    try {
      await client.get('api/missing');
    } catch (e) {
      // Already thrown above, this is for the retry case
    }
  });

  it('parses error body with message field', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Invalid credentials' }), {
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );
    const client = new HttpClient(createConfig());

    try {
      await client.get('api/auth');
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(WildwoodError);
      const err = e as WildwoodError;
      expect(err.status).toBe(401);
      expect(err.message).toBe('Invalid credentials');
      expect(err.code).toBe('Unauthorized');
    }
  });

  // -------------------------------------------------------------------------
  // 401 refresh & retry
  // -------------------------------------------------------------------------

  it('retries once on 401 after successful token refresh', async () => {
    // First call: 401, second call: 200
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: 'success' }));

    // enableRetry must be true for the 401 retry loop to have >1 attempt
    const client = new HttpClient(createConfig({ enableRetry: true, maxRetryAttempts: 2 }));
    client.setTokenProvider(async () => 'refreshed-token');
    client.setOn401Refresh(async () => true);

    const result = await client.get<{ data: string }>('api/secure');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ data: 'success' });
  });

  it('does not retry 401 if refresh fails', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );

    const client = new HttpClient(createConfig());
    client.setOn401Refresh(async () => false);

    await expect(client.get('api/secure')).rejects.toThrow(WildwoodError);
  });

  // -------------------------------------------------------------------------
  // Retry on 5xx
  // -------------------------------------------------------------------------

  it('retries on 5xx when retry is enabled', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response('Server Error', { status: 500, headers: new Headers({ 'content-type': 'text/plain' }) }),
      )
      .mockResolvedValueOnce(jsonResponse({ recovered: true }));

    const client = new HttpClient(createConfig({ enableRetry: true, maxRetryAttempts: 2 }));

    const result = await client.get<{ recovered: boolean }>('api/flaky');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ recovered: true });
  });

  // -------------------------------------------------------------------------
  // Replay safety: aborts, timeouts, and non-idempotent methods
  //
  // Regression cover for a duplicate-submission bug. A slow POST hit the 30s timeout, the abort
  // was classified as a retryable network error (status 0 is falsy, so the `status < 500` guard
  // never fired), and the request was replayed to exhaustion — filing the same feedback three
  // times, because the server commits before it finishes responding.
  // -------------------------------------------------------------------------

  /** Rejects the way a browser does when an AbortController fires mid-flight. */
  function abortingFetch(): (url: string, init: RequestInit) => Promise<Response> {
    return (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        const fail = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
        if (signal.aborted) fail();
        else signal.addEventListener('abort', fail, { once: true });
      });
  }

  const retryConfig = { enableRetry: true, maxRetryAttempts: 3 };

  it('does not retry a POST that timed out', async () => {
    fetchSpy.mockImplementation(abortingFetch());
    const client = new HttpClient(createConfig(retryConfig));

    await expect(client.post('api/SystemFeedback', { title: 'Bug' }, { timeout: 0.01 })).rejects.toMatchObject({
      code: 'Timeout',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('reports a timeout with a usable message rather than the browser abort text', async () => {
    fetchSpy.mockImplementation(abortingFetch());
    const client = new HttpClient(createConfig());

    await expect(client.get('api/slow', { timeout: 0.01 })).rejects.toThrow(/timed out after 10ms/);
  });

  it('does not retry a request the caller cancelled, and reports it as cancelled', async () => {
    fetchSpy.mockImplementation(abortingFetch());
    const client = new HttpClient(createConfig(retryConfig));
    const controller = new AbortController();
    controller.abort();

    await expect(client.get('api/test', { signal: controller.signal })).rejects.toMatchObject({
      code: 'Cancelled',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry a POST that failed with a network error', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
    const client = new HttpClient(createConfig(retryConfig));

    await expect(client.post('api/SystemFeedback', { title: 'Bug' })).rejects.toBeInstanceOf(WildwoodError);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry a POST on 5xx', async () => {
    fetchSpy.mockResolvedValue(textResponse('Server Error', 500));
    const client = new HttpClient(createConfig(retryConfig));

    await expect(client.post('api/SystemFeedback', { title: 'Bug' })).rejects.toBeInstanceOf(WildwoodError);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('still retries idempotent methods on a network error', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new HttpClient(createConfig({ enableRetry: true, maxRetryAttempts: 2 }));

    const result = await client.get<{ ok: boolean }>('api/test');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ ok: true });
  });

  it('still retries DELETE on 5xx (idempotent by definition)', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('Server Error', 500)).mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new HttpClient(createConfig({ enableRetry: true, maxRetryAttempts: 2 }));

    const result = await client.delete<{ ok: boolean }>('api/thing/1');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ ok: true });
  });

  it('still retries a POST after a 401 refresh (the server never applied it)', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ created: true }));

    const client = new HttpClient(createConfig(retryConfig));
    client.setOn401Refresh(async () => true);

    const result = await client.post<{ created: boolean }>('api/SystemFeedback', { title: 'Bug' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ created: true });
  });

  // -------------------------------------------------------------------------
  // Interceptors
  // -------------------------------------------------------------------------

  it('runs request interceptors', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    const client = new HttpClient(createConfig());

    client.addRequestInterceptor((_url, init) => {
      (init.headers as Record<string, string>)['X-Custom'] = 'intercepted';
      return init;
    });

    await client.get('api/test');

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.headers['X-Custom']).toBe('intercepted');
  });

  it('runs response interceptors with timing', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new HttpClient(createConfig());
    let capturedDuration = 0;

    client.addResponseInterceptor((_url, _response, durationMs) => {
      capturedDuration = durationMs;
    });

    await client.get('api/test');

    expect(capturedDuration).toBeGreaterThanOrEqual(0);
  });

  it('unsubscribes interceptors', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(jsonResponse({})));
    const client = new HttpClient(createConfig());
    let callCount = 0;

    const unsub = client.addRequestInterceptor((_url, init) => {
      callCount++;
      return init;
    });

    await client.get('api/first');
    expect(callCount).toBe(1);

    unsub();
    await client.get('api/second');
    expect(callCount).toBe(1); // not called again
  });

  // -------------------------------------------------------------------------
  // Response parsing
  // -------------------------------------------------------------------------

  it('handles text responses', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('hello world'));
    const client = new HttpClient(createConfig());

    const result = await client.get<string>('api/text');

    expect(result.data).toBe('hello world');
  });

  it('handles 204 no content', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new HttpClient(createConfig());

    const result = await client.delete('api/items/1');

    expect(result.status).toBe(204);
    expect(result.data).toBeUndefined();
  });

  it('returns response headers', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}, 200, { 'x-request-id': 'abc-123' }));
    const client = new HttpClient(createConfig());

    const result = await client.get('api/test');

    expect(result.headers['x-request-id']).toBe('abc-123');
  });
});
