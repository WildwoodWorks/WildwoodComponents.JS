import { describe, it, expect } from 'vitest';
import { decodeToken, isTokenExpired, validateTokenClaims, extractRoles } from '../utils/tokenValidator.js';
import type { TokenPayload } from '../utils/tokenValidator.js';

function makeJwt(payload: object): string {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${h}.${p}.sig`;
}

const futureExp = Math.floor(Date.now() / 1000) + 3600;
const pastExp = Math.floor(Date.now() / 1000) - 3600;

const validPayload = {
  sub: 'user-123',
  email: 'test@example.com',
  given_name: 'Test',
  family_name: 'User',
  app_id: 'app-1',
  company_id: 'co-1',
  role: 'Admin',
  exp: futureExp,
  iat: futureExp - 7200,
  iss: 'wildwood',
  aud: 'wildwood-app',
};

describe('decodeToken', () => {
  it('decodes a valid JWT payload', () => {
    const token = makeJwt(validPayload);
    const decoded = decodeToken(token);

    expect(decoded.sub).toBe('user-123');
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.given_name).toBe('Test');
    expect(decoded.family_name).toBe('User');
    expect(decoded.app_id).toBe('app-1');
    expect(decoded.company_id).toBe('co-1');
    expect(decoded.role).toBe('Admin');
    expect(decoded.exp).toBe(futureExp);
    expect(decoded.iss).toBe('wildwood');
    expect(decoded.aud).toBe('wildwood-app');
  });

  it('throws on invalid JWT format (missing parts)', () => {
    expect(() => decodeToken('not-a-jwt')).toThrow('Invalid JWT format');
    expect(() => decodeToken('two.parts')).toThrow('Invalid JWT format');
  });
});

describe('isTokenExpired', () => {
  it('returns false for a token that has not expired', () => {
    const token = makeJwt({ ...validPayload, exp: futureExp });
    expect(isTokenExpired(token)).toBe(false);
  });

  it('returns true for an expired token', () => {
    const token = makeJwt({ ...validPayload, exp: pastExp });
    expect(isTokenExpired(token)).toBe(true);
  });

  it('respects clockToleranceSeconds', () => {
    // Token expired 10 seconds ago
    const recentExp = Math.floor(Date.now() / 1000) - 10;
    const token = makeJwt({ ...validPayload, exp: recentExp });

    // Without tolerance: expired
    expect(isTokenExpired(token, 0)).toBe(true);

    // With 30s tolerance: not expired
    expect(isTokenExpired(token, 30)).toBe(false);
  });
});

describe('validateTokenClaims', () => {
  it('returns valid for a non-expired token with no extra options', () => {
    const token = makeJwt(validPayload);
    const result = validateTokenClaims(token);
    expect(result.valid).toBe(true);
    expect(result.payload).toBeDefined();
    expect(result.payload!.sub).toBe('user-123');
  });

  it('returns invalid for an expired token', () => {
    const token = makeJwt({ ...validPayload, exp: pastExp });
    const result = validateTokenClaims(token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Token has expired');
  });

  it('validates issuer', () => {
    const token = makeJwt(validPayload);

    const valid = validateTokenClaims(token, { issuer: 'wildwood' });
    expect(valid.valid).toBe(true);

    const invalid = validateTokenClaims(token, { issuer: 'wrong-issuer' });
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toContain('Invalid issuer');
  });

  it('validates audience', () => {
    const token = makeJwt(validPayload);

    const valid = validateTokenClaims(token, { audience: 'wildwood-app' });
    expect(valid.valid).toBe(true);

    const invalid = validateTokenClaims(token, { audience: 'wrong-audience' });
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toContain('Invalid audience');
  });

  it('returns invalid for a malformed token', () => {
    const result = validateTokenClaims('bad-token');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('extractRoles', () => {
  it('extracts a single role as an array', () => {
    const payload = { role: 'Admin' } as TokenPayload;
    expect(extractRoles(payload)).toEqual(['Admin']);
  });

  it('extracts multiple roles', () => {
    const payload = { role: ['Admin', 'Editor'] } as TokenPayload;
    expect(extractRoles(payload)).toEqual(['Admin', 'Editor']);
  });

  it('returns empty array when no role claim', () => {
    const payload = {} as TokenPayload;
    expect(extractRoles(payload)).toEqual([]);
  });

  it('returns empty array when role is undefined', () => {
    const payload = { role: undefined } as TokenPayload;
    expect(extractRoles(payload)).toEqual([]);
  });
});
