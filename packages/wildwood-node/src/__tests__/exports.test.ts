import { describe, it, expect } from 'vitest';
import {
  createAuthMiddleware,
  createProxyMiddleware,
  createFeedbackProxyMiddleware,
  createRateLimitMiddleware,
  createAdminClient,
  AdminClient,
  FeedbackService,
  decodeToken,
  decodeTokenHeader,
  isTokenExpired,
  validateTokenClaims,
  verifyToken,
  extractRoles,
  JwksClient,
  createJwksClient,
  verifyRS256Signature,
  SeederApiClient,
  createSeederApiClient,
  SeederApiError,
  SeederRunner,
  createSeederRunner,
  runSeeder,
  SeederContext,
  SeederTaskResult,
  resolveSeederOptions,
  hasCredentials,
  consoleSeederLogger,
} from '../index.js';

describe('public exports', () => {
  it('exports createAuthMiddleware as a function', () => {
    expect(typeof createAuthMiddleware).toBe('function');
  });

  it('exports createProxyMiddleware as a function', () => {
    expect(typeof createProxyMiddleware).toBe('function');
  });

  it('exports createFeedbackProxyMiddleware as a function', () => {
    expect(typeof createFeedbackProxyMiddleware).toBe('function');
  });

  it('exports FeedbackService (from core) as a class', () => {
    expect(typeof FeedbackService).toBe('function');
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

  // ── Seeder (server-side app-data seeding harness) ──

  it('exports SeederApiClient as a class', () => {
    expect(typeof SeederApiClient).toBe('function');
  });

  it('exports createSeederApiClient as a function', () => {
    expect(typeof createSeederApiClient).toBe('function');
  });

  it('exports SeederApiError as a class', () => {
    expect(typeof SeederApiError).toBe('function');
  });

  it('exports SeederRunner as a class', () => {
    expect(typeof SeederRunner).toBe('function');
  });

  it('exports createSeederRunner as a function', () => {
    expect(typeof createSeederRunner).toBe('function');
  });

  it('exports runSeeder as a function', () => {
    expect(typeof runSeeder).toBe('function');
  });

  it('exports SeederContext as a class', () => {
    expect(typeof SeederContext).toBe('function');
  });

  it('exports SeederTaskResult as a class', () => {
    expect(typeof SeederTaskResult).toBe('function');
  });

  it('exports resolveSeederOptions as a function', () => {
    expect(typeof resolveSeederOptions).toBe('function');
  });

  it('exports hasCredentials as a function', () => {
    expect(typeof hasCredentials).toBe('function');
  });

  it('exports consoleSeederLogger as an object', () => {
    expect(typeof consoleSeederLogger).toBe('object');
  });
});
