import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';

/** Build an unsigned JWT (decode-only mode skips signature verification). */
function makeJwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc(payload)}.sig`;
}

const nowSec = () => Math.floor(Date.now() / 1000);

function validToken(overrides: Record<string, unknown> = {}): string {
  return makeJwt({
    sub: 'user-1',
    email: 'user@example.com',
    given_name: 'Ada',
    family_name: 'Lovelace',
    app_id: 'app-1',
    company_id: 'co-1',
    role: 'Admin',
    exp: nowSec() + 3600,
    iat: nowSec() - 10,
    ...overrides,
  });
}

function makeReq(headers: Record<string, string> = {}, path = '/api/protected'): Request {
  return { path, headers } as unknown as Request;
}

function makeRes() {
  const res: Record<string, unknown> = { statusCode: 200 };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: unknown) => {
    res.body = data;
    return res;
  });
  return res as unknown as Response & { statusCode: number; body: unknown };
}

// Decode-only mode (no JWKS network calls) — signature verification disabled.
const mw = () => createAuthMiddleware({ baseUrl: 'https://api.test', jwksClient: false });

describe('createAuthMiddleware (decode-only)', () => {
  it('attaches a wildwoodUser built from JWT claims and calls next', async () => {
    const req = makeReq({ authorization: `Bearer ${validToken()}` });
    const next = vi.fn();

    await mw()(req, makeRes(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.wildwoodUser).toMatchObject({
      userId: 'user-1',
      email: 'user@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      appId: 'app-1',
      companyId: 'co-1',
    });
    expect(req.wildwoodUser?.roles).toContain('Admin');
    expect(req.wildwoodToken).toBe(validToken());
  });

  it('accepts a raw token without the Bearer prefix', async () => {
    const req = makeReq({ authorization: validToken() });
    const next = vi.fn();

    await mw()(req, makeRes(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.wildwoodUser?.userId).toBe('user-1');
  });

  it('responds 401 when the authorization header is missing', async () => {
    const res = makeRes();
    const next = vi.fn();

    await mw()(makeReq(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('responds 401 for an expired token', async () => {
    const req = makeReq({ authorization: `Bearer ${validToken({ exp: nowSec() - 60 })}` });
    const res = makeRes();
    const next = vi.fn();

    await mw()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('bypasses excluded paths without requiring a token', async () => {
    const middleware = createAuthMiddleware({
      baseUrl: 'https://api.test',
      jwksClient: false,
      excludePaths: ['/public'],
    });
    const req = makeReq({}, '/public/info');
    const next = vi.fn();

    await middleware(req, makeRes(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.wildwoodUser).toBeUndefined();
  });

  it('routes failures to a custom onError handler when provided', async () => {
    const onError = vi.fn();
    const middleware = createAuthMiddleware({ baseUrl: 'https://api.test', jwksClient: false, onError });

    await middleware(makeReq(), makeRes(), vi.fn());

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
