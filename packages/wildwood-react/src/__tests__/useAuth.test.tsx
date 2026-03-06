import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuth } from '../hooks/useAuth.js';
import { createWrapper } from './testUtils.js';

describe('useAuth', () => {
  it('starts not authenticated', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('starts with null user', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    expect(result.current.user).toBeNull();
  });

  it('exposes all auth methods', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    expect(typeof result.current.login).toBe('function');
    expect(typeof result.current.register).toBe('function');
    expect(typeof result.current.registerWithToken).toBe('function');
    expect(typeof result.current.logout).toBe('function');
    expect(typeof result.current.refreshToken).toBe('function');
    expect(typeof result.current.getAvailableProviders).toBe('function');
    expect(typeof result.current.getCaptchaConfiguration).toBe('function');
    expect(typeof result.current.getAuthenticationConfiguration).toBe('function');
    expect(typeof result.current.validatePassword).toBe('function');
    expect(typeof result.current.getPasswordRequirementsText).toBe('function');
    expect(typeof result.current.requestPasswordReset).toBe('function');
    expect(typeof result.current.resetPassword).toBe('function');
    expect(typeof result.current.validateLicenseToken).toBe('function');
    expect(typeof result.current.hasRegistrationTokens).toBe('function');
    expect(typeof result.current.validateRegistrationToken).toBe('function');
    expect(typeof result.current.getPasskeyAuthenticationOptions).toBe('function');
    expect(typeof result.current.verifyPasskeyAuthentication).toBe('function');
    expect(typeof result.current.getPasskeyRegistrationOptions).toBe('function');
    expect(typeof result.current.completePasskeyRegistration).toBe('function');
    expect(typeof result.current.sendTwoFactorCode).toBe('function');
    expect(typeof result.current.verifyTwoFactorCode).toBe('function');
    expect(typeof result.current.verifyTwoFactorRecoveryCode).toBe('function');
  });
});
