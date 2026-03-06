import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  decodeJwtPayload,
  getTokenExpiry,
  isTokenExpired,
  getTokenRemainingMs,
  getRefreshTimeMs,
} from '../auth/tokenUtils.js';

/** Build a minimal JWT (header.payload.signature) for testing */
function makeJwt(payload: object): string {
  const h = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = btoa(JSON.stringify(payload));
  return `${h}.${p}.sig`;
}

describe('tokenUtils', () => {
  describe('decodeJwtPayload', () => {
    it('decodes a valid JWT payload', () => {
      const token = makeJwt({ sub: 'user-1', email: 'a@b.com', exp: 9999999999 });
      const payload = decodeJwtPayload(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe('user-1');
      expect(payload!.email).toBe('a@b.com');
    });

    it('returns null for a malformed token (wrong segment count)', () => {
      expect(decodeJwtPayload('only-one-part')).toBeNull();
      expect(decodeJwtPayload('two.parts')).toBeNull();
    });

    it('returns null for invalid base64 in payload', () => {
      expect(decodeJwtPayload('aaa.!!!invalid!!!.sig')).toBeNull();
    });

    it('decodes tokens with extra claims', () => {
      const token = makeJwt({ sub: '1', company_id: 'c1', app_id: 'a1', role: ['Admin', 'User'] });
      const payload = decodeJwtPayload(token);
      expect(payload!.company_id).toBe('c1');
      expect(payload!.app_id).toBe('a1');
      expect(payload!.role).toEqual(['Admin', 'User']);
    });
  });

  describe('getTokenExpiry', () => {
    it('returns expiry in milliseconds', () => {
      const exp = 1700000000;
      const token = makeJwt({ exp });
      expect(getTokenExpiry(token)).toBe(exp * 1000);
    });

    it('returns null when no exp claim', () => {
      const token = makeJwt({ sub: 'user-1' });
      expect(getTokenExpiry(token)).toBeNull();
    });

    it('returns null for invalid token', () => {
      expect(getTokenExpiry('bad')).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns false for a token expiring in the future', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = makeJwt({ exp: futureExp });
      expect(isTokenExpired(token)).toBe(false);
    });

    it('returns true for a token that already expired', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 60;
      const token = makeJwt({ exp: pastExp });
      expect(isTokenExpired(token)).toBe(true);
    });

    it('returns true when within buffer window', () => {
      const exp = Math.floor(Date.now() / 1000) + 30; // 30s from now
      const token = makeJwt({ exp });
      expect(isTokenExpired(token, 60_000)).toBe(true); // 60s buffer
    });

    it('returns true for token without exp claim', () => {
      const token = makeJwt({ sub: 'user-1' });
      expect(isTokenExpired(token)).toBe(true);
    });
  });

  describe('getTokenRemainingMs', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns positive value for valid future token', () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = makeJwt({ exp });
      const remaining = getTokenRemainingMs(token);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(3600 * 1000);
    });

    it('returns 0 for expired token', () => {
      const exp = Math.floor(Date.now() / 1000) - 100;
      const token = makeJwt({ exp });
      expect(getTokenRemainingMs(token)).toBe(0);
    });

    it('returns 0 for token without exp', () => {
      const token = makeJwt({ sub: 'user-1' });
      expect(getTokenRemainingMs(token)).toBe(0);
    });
  });

  describe('getRefreshTimeMs', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns 80% of token lifetime when iat and exp are present', () => {
      const now = Math.floor(Date.now() / 1000);
      const iat = now;
      const exp = now + 1000; // 1000 second lifetime
      const token = makeJwt({ iat, exp });

      const refreshMs = getRefreshTimeMs(token);
      // Refresh should happen at iat + 0.8 * lifetime = now + 800s
      // So refreshMs should be ~800_000 ms from now
      expect(refreshMs).toBeGreaterThan(790_000);
      expect(refreshMs).toBeLessThanOrEqual(800_000);
    });

    it('falls back to remaining - 5min when iat is missing', () => {
      const exp = Math.floor(Date.now() / 1000) + 600; // 10 min from now
      const token = makeJwt({ exp }); // no iat
      const refreshMs = getRefreshTimeMs(token);
      // remaining ~600_000ms, fallback = remaining - 300_000 = ~300_000
      expect(refreshMs).toBeGreaterThan(290_000);
      expect(refreshMs).toBeLessThanOrEqual(300_000);
    });

    it('returns 0 for expired token', () => {
      const exp = Math.floor(Date.now() / 1000) - 100;
      const token = makeJwt({ exp, iat: exp - 1000 });
      expect(getRefreshTimeMs(token)).toBe(0);
    });
  });
});
