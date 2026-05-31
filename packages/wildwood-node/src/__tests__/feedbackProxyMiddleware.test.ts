import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createFeedbackProxyMiddleware } from '../middleware/feedbackProxyMiddleware.js';

const BASE = 'https://api.example.com';
const API_KEY = 'srv-key';

// Capture of the last fetch() call so tests can assert URL + headers + body.
interface FetchCall {
  url: string;
  init: RequestInit;
}

function mockFetchJson(body: unknown, status = 200): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  return { calls };
}

// Minimal Express req/res/next doubles.
function makeReq(overrides: Partial<Request> & { path: string; method: string }): Request {
  return {
    headers: {},
    query: {},
    body: undefined,
    originalUrl: overrides.path,
    ...overrides,
  } as unknown as Request;
}

function makeRes() {
  const res: Record<string, unknown> = {};
  res.statusCode = 200;
  res.headers = {};
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.setHeader = vi.fn((k: string, v: unknown) => {
    (res.headers as Record<string, unknown>)[k] = v;
    return res;
  });
  res.json = vi.fn((data: unknown) => {
    res.body = data;
    return res;
  });
  res.send = vi.fn((data: unknown) => {
    res.body = data;
    return res;
  });
  return res as unknown as Response & {
    statusCode: number;
    body: unknown;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

const headersOf = (init: RequestInit) => init.headers as Record<string, string>;

describe('createFeedbackProxyMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps POST {mount}/submit -> POST api/SystemFeedback with body + API key', async () => {
    const { calls } = mockFetchJson({ id: 'fb-1' }, 201);
    const mw = createFeedbackProxyMiddleware({ baseUrl: BASE, apiKey: API_KEY });
    const req = makeReq({
      path: '/submit',
      method: 'POST',
      body: { title: 'Bug', description: 'broke', feedbackType: 'Bug' },
    });
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await mw(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/api/SystemFeedback`);
    expect(calls[0].init.method).toBe('POST');
    expect(headersOf(calls[0].init)['X-API-Key']).toBe(API_KEY);
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ title: 'Bug', feedbackType: 'Bug' });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ id: 'fb-1' });
  });

  it('maps GET {mount}/duplicate-check -> upstream with query preserved', async () => {
    const { calls } = mockFetchJson({ hasPotentialDuplicate: false });
    const mw = createFeedbackProxyMiddleware({ baseUrl: BASE, apiKey: API_KEY });
    const req = makeReq({
      path: '/duplicate-check',
      method: 'GET',
      originalUrl: '/duplicate-check?title=Hi&appId=app-1',
    });
    const res = makeRes();

    await mw(req, res, vi.fn() as NextFunction);

    expect(calls[0].url).toBe(`${BASE}/api/SystemFeedback/duplicate-check?title=Hi&appId=app-1`);
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.body).toBeUndefined();
  });

  it('maps POST {mount}/:id/vote -> POST api/SystemFeedback/{id}/vote (no body)', async () => {
    const { calls } = mockFetchJson({ voteCount: 5 });
    const mw = createFeedbackProxyMiddleware({ baseUrl: BASE, apiKey: API_KEY });
    const req = makeReq({ path: '/abc-123/vote', method: 'POST' });
    const res = makeRes();

    await mw(req, res, vi.fn() as NextFunction);

    expect(calls[0].url).toBe(`${BASE}/api/SystemFeedback/abc-123/vote`);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBeUndefined();
    expect(res.body).toEqual({ voteCount: 5 });
  });

  it('maps GET {mount}/widget?appId= -> AppComponentConfigurations widget', async () => {
    const { calls } = mockFetchJson({ isEnabled: true });
    const mw = createFeedbackProxyMiddleware({ baseUrl: BASE, apiKey: API_KEY });
    const req = makeReq({
      path: '/widget',
      method: 'GET',
      query: { appId: 'app-9' },
      originalUrl: '/widget?appId=app-9',
    });
    const res = makeRes();

    await mw(req, res, vi.fn() as NextFunction);

    expect(calls[0].url).toBe(`${BASE}/api/AppComponentConfigurations/app-9/feedback/widget`);
  });

  it('maps GET {mount}/:appId/widget path form', async () => {
    const { calls } = mockFetchJson({ isEnabled: true });
    const mw = createFeedbackProxyMiddleware({ baseUrl: BASE, apiKey: API_KEY });
    const req = makeReq({ path: '/app-42/widget', method: 'GET' });
    const res = makeRes();

    await mw(req, res, vi.fn() as NextFunction);

    expect(calls[0].url).toBe(`${BASE}/api/AppComponentConfigurations/app-42/feedback/widget`);
  });

  it('does not turn an encoded-slash id into a path-traversal (forwards %2F literally)', async () => {
    const { calls } = mockFetchJson({ voteCount: 1 });
    const mw = createFeedbackProxyMiddleware({ baseUrl: BASE, apiKey: API_KEY });
    // Express leaves req.path percent-encoded; an attacker-supplied ..%2F..%2Fadmin
    // must stay a single encoded path segment, never decoded into separators.
    const req = makeReq({ path: '/..%2F..%2Fadmin/vote', method: 'POST' });
    const res = makeRes();

    await mw(req, res, vi.fn() as NextFunction);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/api/SystemFeedback/..%2F..%2Fadmin/vote`);
  });

  it('does not throw/500 on a malformed percent sequence in the id', async () => {
    const { calls } = mockFetchJson({ voteCount: 0 });
    const mw = createFeedbackProxyMiddleware({ baseUrl: BASE, apiKey: API_KEY });
    // A lone '%' is not a valid escape; the proxy must not call decodeURIComponent
    // on the raw segment (which would throw URIError) and 500.
    const req = makeReq({ path: '/100%done/vote', method: 'POST' });
    const res = makeRes();

    await mw(req, res, vi.fn() as NextFunction);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/api/SystemFeedback/100%done/vote`);
    expect(res.statusCode).toBe(200);
  });

  it('falls through (next) for unrecognized routes', async () => {
    const { calls } = mockFetchJson({});
    const mw = createFeedbackProxyMiddleware({ baseUrl: BASE, apiKey: API_KEY });
    const req = makeReq({ path: '/not-a-feedback-route', method: 'GET' });
    const res = makeRes();
    const next = vi.fn() as NextFunction;

    await mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
  });

  it('attaches bearer token from getToken (server-side, never from browser)', async () => {
    const { calls } = mockFetchJson({ id: 'fb-2' }, 201);
    const mw = createFeedbackProxyMiddleware({
      baseUrl: BASE,
      apiKey: API_KEY,
      getToken: () => 'session-token',
    });
    const req = makeReq({ path: '/submit', method: 'POST', body: { title: 't' } });
    const res = makeRes();

    await mw(req, res, vi.fn() as NextFunction);

    expect(headersOf(calls[0].init)['Authorization']).toBe('Bearer session-token');
  });

  it('falls back to req.wildwoodToken when getToken is not provided', async () => {
    const { calls } = mockFetchJson({ voteCount: 1 });
    const mw = createFeedbackProxyMiddleware({ baseUrl: BASE, apiKey: API_KEY });
    const req = makeReq({ path: '/x/vote', method: 'POST' });
    (req as unknown as Record<string, unknown>).wildwoodToken = 'attached-by-auth-mw';
    const res = makeRes();

    await mw(req, res, vi.fn() as NextFunction);

    expect(headersOf(calls[0].init)['Authorization']).toBe('Bearer attached-by-auth-mw');
  });

  it('forwards anonymously (no Authorization) when no token is available', async () => {
    const { calls } = mockFetchJson({ id: 'fb-3' }, 201);
    const mw = createFeedbackProxyMiddleware({ baseUrl: BASE, apiKey: API_KEY });
    const req = makeReq({ path: '/submit', method: 'POST', body: { title: 't' } });
    const res = makeRes();

    await mw(req, res, vi.fn() as NextFunction);

    expect(headersOf(calls[0].init)['Authorization']).toBeUndefined();
    expect(headersOf(calls[0].init)['X-API-Key']).toBe(API_KEY);
  });

  it('returns 502 on upstream fetch failure', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network down')));
    const mw = createFeedbackProxyMiddleware({ baseUrl: BASE, apiKey: API_KEY });
    const req = makeReq({ path: '/submit', method: 'POST', body: {} });
    const res = makeRes();

    await mw(req, res, vi.fn() as NextFunction);

    expect(res.statusCode).toBe(502);
  });
});
