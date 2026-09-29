import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { WildwoodError } from '@wildwood/core';
import {
  signupErrorCategory,
  signupErrorCategoryFromCode,
  signupPlanKey,
  trackSignupFunnel,
  useSignupFunnel,
} from '@wildwood/react-shared';
import { createTestClient, createWrapper } from './testUtils.js';

describe('signupErrorCategoryFromCode', () => {
  it.each([
    ['USERNAME_EXISTS', 'username_taken'],
    ['USER_EXISTS', 'email_taken'],
    ['EmailExists', 'email_taken'],
    ['PASSWORD_INVALID', 'password_policy'],
    ['PasswordTooShort', 'password_policy'],
    ['TOKEN_EXPIRED', 'invalid_token'],
    ['registration_token_rejected', 'invalid_token'],
    ['CAPTCHA_FAILED', 'captcha'],
    ['CaptchaRequired', 'captcha'],
    ['ValidationError', 'validation'],
    ['EMAIL_REQUIRED', 'validation'],
    ['RegistrationNotAllowed', 'registration_closed'],
    ['OpenRegistrationDisabled', 'registration_closed'],
    ['RATE_LIMIT_EXCEEDED', 'rate_limited'],
    ['RateLimited', 'rate_limited'],
    ['NetworkError', 'network'],
    ['Timeout', 'network'],
    ['INTERNAL_ERROR', 'server'],
    ['ServerError', 'server'],
    ['something_new', 'unknown'],
    ['', 'unknown'],
  ])('%s -> %s', (code, category) => {
    expect(signupErrorCategoryFromCode(code)).toBe(category);
  });

  it('falls back on the HTTP status', () => {
    expect(signupErrorCategoryFromCode(null, 0)).toBe('network');
    expect(signupErrorCategoryFromCode(undefined, 429)).toBe('rate_limited');
    expect(signupErrorCategoryFromCode('Unknown', 503)).toBe('server');
    expect(signupErrorCategoryFromCode('Unknown', 400)).toBe('validation');
    expect(signupErrorCategoryFromCode('Unknown', 404)).toBe('unknown');
  });
});

describe('signupErrorCategory', () => {
  it("prefers the server's errorCode, then the client code and status", () => {
    expect(signupErrorCategory(new WildwoodError('x', 400, undefined, { errorCode: 'USERNAME_EXISTS' }))).toBe(
      'username_taken',
    );
    expect(signupErrorCategory(new WildwoodError('x', 429))).toBe('rate_limited');
    expect(signupErrorCategory(new WildwoodError('x', 502, undefined, { errorCode: 'mystery' }))).toBe('server');
  });

  it('reads coded objects and fetch failures, and never a message', () => {
    expect(signupErrorCategory({ code: 'PASSWORD_INVALID', message: 'nope' })).toBe('password_policy');
    expect(signupErrorCategory(new TypeError('Failed to fetch'))).toBe('network');
    expect(signupErrorCategory(new Error('Email already registered'))).toBe('unknown');
    expect(signupErrorCategory('Email already registered')).toBe('unknown');
    expect(signupErrorCategory(null)).toBe('unknown');
  });
});

describe('signupPlanKey', () => {
  it('uses the id, else a slug of the name, capped at 100', () => {
    expect(signupPlanKey({ id: 'tier-pro', name: 'Pro' })).toBe('tier-pro');
    expect(signupPlanKey({ id: '', name: 'Pro Plus (Annual)' })).toBe('pro_plus_annual');
    expect(signupPlanKey({ name: 'x'.repeat(150) })).toHaveLength(100);
    expect(signupPlanKey({ name: '!!!' })).toBeNull();
    expect(signupPlanKey(null)).toBeNull();
  });
});

describe('trackSignupFunnel', () => {
  it('never throws, with or without an attribution service', () => {
    expect(() => trackSignupFunnel(null, 'signup_view')).not.toThrow();
    expect(() => trackSignupFunnel({} as never, 'signup_view')).not.toThrow();
    const throwing = {
      attribution: {
        track: () => {
          throw new Error('boom');
        },
      },
    } as never;
    expect(() => trackSignupFunnel(throwing, 'signup_view')).not.toThrow();
  });
});

describe('useSignupFunnel', () => {
  it('sends the view on mount, the start once, and only categories for errors', () => {
    const client = createTestClient();
    const track = vi.spyOn(client.attribution, 'track').mockImplementation(() => {});
    const { result, rerender } = renderHook(() => useSignupFunnel(), { wrapper: createWrapper(client) });
    const first = result.current;

    result.current.start();
    result.current.start();
    result.current.submit();
    result.current.error('email_taken');
    result.current.error('Raw message with ada@example.com');
    rerender();

    expect(track.mock.calls).toEqual([
      ['signup_view', undefined],
      ['signup_start', undefined],
      ['signup_submit', undefined],
      ['signup_error', { label: 'email_taken' }],
      ['signup_error', { label: 'unknown' }],
    ]);
    expect(result.current).toBe(first);
  });

  it('is inert when disabled and safe outside a provider', () => {
    const client = createTestClient();
    const track = vi.spyOn(client.attribution, 'track').mockImplementation(() => {});
    const { result } = renderHook(() => useSignupFunnel({ enabled: false }), { wrapper: createWrapper(client) });
    result.current.start();
    result.current.submit();
    result.current.error('validation');
    expect(track).not.toHaveBeenCalled();

    const outside = renderHook(() => useSignupFunnel());
    expect(() => outside.result.current.submit()).not.toThrow();
  });
});
