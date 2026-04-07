import { describe, it, expect } from 'vitest';
import {
  createAuthMiddleware,
  createProxyMiddleware,
  createRateLimitMiddleware,
  createAdminClient,
  AdminClient,
  decodeToken,
  decodeTokenHeader,
  isTokenExpired,
  validateTokenClaims,
  verifyToken,
  extractRoles,
  JwksClient,
  createJwksClient,
  verifyRS256Signature,
} from '../index.js';

describe('public exports', () => {
  it('exports createAuthMiddleware as a function', () => {
    expect(typeof createAuthMiddleware).toBe('function');
  });

  it('exports createProxyMiddleware as a function', () => {
    expect(typeof createProxyMiddleware).toBe('function');
  });

  it('exports createRateLimitMiddleware as a function', () => {
    expect(typeof createRateLimitMiddleware).toBe('function');
  });

  it('exports createAdminClient as a function', () => {
    expect(typeof createAdminClient).toBe('function');
  });

  it('exports AdminClient as a class', () => {
    expect(typeof AdminClient).toBe('function');
  });

  it('exports decodeToken as a function', () => {
    expect(typeof decodeToken).toBe('function');
  });

  it('exports decodeTokenHeader as a function', () => {
    expect(typeof decodeTokenHeader).toBe('function');
  });

  it('exports isTokenExpired as a function', () => {
    expect(typeof isTokenExpired).toBe('function');
  });

  it('exports validateTokenClaims as a function', () => {
    expect(typeof validateTokenClaims).toBe('function');
  });

  it('exports verifyToken as a function', () => {
    expect(typeof verifyToken).toBe('function');
  });

  it('exports extractRoles as a function', () => {
    expect(typeof extractRoles).toBe('function');
  });

  it('exports JwksClient as a class', () => {
    expect(typeof JwksClient).toBe('function');
  });

  it('exports createJwksClient as a function', () => {
    expect(typeof createJwksClient).toBe('function');
  });

  it('exports verifyRS256Signature as a function', () => {
    expect(typeof verifyRS256Signature).toBe('function');
  });
});
