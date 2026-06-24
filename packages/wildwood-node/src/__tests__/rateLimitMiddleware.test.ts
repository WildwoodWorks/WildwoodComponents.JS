import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { createRateLimitMiddleware } from '../middleware/rateLimitMiddleware.js';

function makeReq(path = '/api/x'): Request {
  return { path, ip: '9.9.9.9', socket: { remoteAddress: '9.9.9.9' }, headers: {} } as unknown as Request;
}

function makeRes() {
  const res: Record<string, unknown> = { statusCode: 200, headers: {} };
  res.setHeader = vi.fn((k: string, v: unknown) => {
    (res.headers as Record<string, unknown>)[k] = v;
    return res;
  });
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: unknown) => {
    res.body = data;
    return res;
  });
  return res as unknown as Response & { statusCode: number; body: unknown; headers: Record<string, unknown> };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createRateLimitMiddleware', () => {
  it('allows requests up to the limit, then responds 429', () => {
    const mw = createRateLimitMiddleware({ maxRequests: 2, keyExtractor: () => 'client-a' });
    const next = vi.fn();

    mw(makeReq(), makeRes(), next);
    mw(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(2);

    const res = makeRes();
    mw(makeReq(), res, next);

    expect(next).toHaveBeenCalledTimes(2); // not advanced on the limited request
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: expect.stringContaining('Too many requests') });
  });

  it('emits X-RateLimit headers with a decreasing remaining count', () => {
    const mw = createRateLimitMiddleware({ maxRequests: 5, keyExtractor: () => 'client-b' });
    const res = makeRes();

    mw(makeReq(), res, vi.fn());

    expect(res.headers['X-RateLimit-Limit']).toBe(5);
    expect(res.headers['X-RateLimit-Remaining']).toBe(4);
    expect(res.headers['X-RateLimit-Reset']).toEqual(expect.any(Number));
  });

  it('bypasses excluded paths entirely', () => {
    const mw = createRateLimitMiddleware({
      maxRequests: 1,
      keyExtractor: () => 'client-c',
      excludePaths: ['/health'],
    });
    const next = vi.fn();

    // Far more than the limit, but all on an excluded path.
    for (let i = 0; i < 5; i++) mw(makeReq('/health'), makeRes(), next);

    expect(next).toHaveBeenCalledTimes(5);
  });

  it('invokes onLimitReached instead of the default 429 response', () => {
    const onLimitReached = vi.fn();
    const mw = createRateLimitMiddleware({ maxRequests: 1, keyExtractor: () => 'client-d', onLimitReached });
    const next = vi.fn();

    mw(makeReq(), makeRes(), next); // ok
    mw(makeReq(), makeRes(), next); // exceeds

    expect(onLimitReached).toHaveBeenCalledTimes(1);
  });

  it('resets the window after windowMs elapses', () => {
    vi.useFakeTimers();
    const mw = createRateLimitMiddleware({ maxRequests: 1, windowMs: 1_000, keyExtractor: () => 'client-e' });
    const next = vi.fn();

    mw(makeReq(), makeRes(), next); // count 1, ok
    const limited = makeRes();
    mw(makeReq(), limited, next); // count 2 > 1, limited
    expect(limited.statusCode).toBe(429);

    vi.advanceTimersByTime(1_001);

    const afterReset = makeRes();
    mw(makeReq(), afterReset, next); // new window, allowed
    expect(afterReset.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
