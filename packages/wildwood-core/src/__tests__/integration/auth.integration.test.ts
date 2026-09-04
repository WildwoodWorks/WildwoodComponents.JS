import { describe, it, expect } from 'vitest';
import './setup.js';
import { createWildwoodClient } from '../../index.js';

function createTestClient() {
  return createWildwoodClient({
    baseUrl: 'https://test-api.example.com',
    appId: 'test-app-id',
    storage: 'memory',
  });
}

describe('Auth integration (msw)', () => {
  it('login succeeds with valid credentials', async () => {
    const client = createTestClient();
    const result = await client.auth.login({
      email: 'user@example.com',
      password: 'password',
      appId: 'test-app-id',
      appVersion: '1.0.0',
      platform: 'web',
      deviceInfo: 'test',
    });

    expect(result.jwtToken).toBeDefined();
    expect(result.email).toBe('user@example.com');
    expect(result.firstName).toBe('Test');
  });

  it('login fails with invalid credentials', async () => {
    const client = createTestClient();
    await expect(
      client.auth.login({
        email: 'bad@example.com',
        password: 'wrong',
        appId: 'test-app-id',
        appVersion: '1.0.0',
        platform: 'web',
        deviceInfo: 'test',
      }),
    ).rejects.toThrow();
  });

  // The reported bug, end to end: an account created with a temporary password could reach the
  // reset screen and no further, because the reset call was sent anonymously and 401'd.
  it('completes the forced password-reset flow after a temporary-password login', async () => {
    const client = createTestClient();

    const login = await client.auth.login({
      email: 'temp@example.com',
      password: 'TempPass123',
      appId: 'test-app-id',
      appVersion: '1.0.0',
      platform: 'web',
      deviceInfo: 'test',
    });

    expect(login.requiresPasswordReset).toBe(true);
    expect(login.jwtToken).toBeTruthy();

    // The component skips completeAuth() on this branch, so the reset must work off the token
    // login() already stored — nothing else has run in between.
    await expect(client.auth.resetPassword('NewPass1!', 'NewPass1!', 'test-app-id')).resolves.toBe(true);

    const relogin = await client.auth.login({
      email: 'temp@example.com',
      password: 'NewPass1!',
      appId: 'test-app-id',
      appVersion: '1.0.0',
      platform: 'web',
      deviceInfo: 'test',
    });

    expect(relogin.requiresPasswordReset).toBe(false);
  });

  it('rejects a password reset sent without a session', async () => {
    const client = createTestClient();

    await expect(client.auth.resetPassword('NewPass1!', 'NewPass1!', 'test-app-id')).rejects.toThrow();
  });

  it('requestPasswordReset returns generically for any email', async () => {
    const client = createTestClient();
    await expect(client.auth.requestPasswordReset('anyone@example.com', 'test-app-id')).resolves.toBe(true);
  });

  it('register returns user with token', async () => {
    const client = createTestClient();
    const result = await client.auth.register({
      email: 'new@example.com',
      password: 'password123',
      firstName: 'New',
      lastName: 'User',
      appId: 'test-app-id',
      appVersion: '1.0.0',
      platform: 'web',
      deviceInfo: 'test',
    });

    expect(result.jwtToken).toBeDefined();
    expect(result.firstName).toBe('New');
  });

  it('getAvailableProviders returns provider list', async () => {
    const client = createTestClient();
    const providers = await client.auth.getAvailableProviders('test-app-id');

    expect(providers).toHaveLength(2);
    expect(providers[0].name).toBe('Google');
  });

  it('getProviderAuthorizationUrl calls oauth/{appId}/authorize and returns the URL', async () => {
    const client = createTestClient();
    const url = await client.auth.getProviderAuthorizationUrl('Google', 'test-app-id');

    expect(url).toBe('https://accounts.example.com/google/authorize?app=test-app-id');
  });

  it('registerOpen returns a token-less registration result', async () => {
    const client = createTestClient();
    const result = await client.auth.registerOpen({
      email: 'open@example.com',
      password: 'password123',
      firstName: 'Open',
      lastName: 'Reg',
      appId: 'test-app-id',
      platform: 'web',
      deviceInfo: 'test',
    });

    expect(result.success).toBe(true);
    expect(result.userId).toBe('user-open-1');
    // No tokens: open registration requires a credential login afterwards
    expect((result as { jwtToken?: string }).jwtToken).toBeUndefined();
    expect(client.session.isAuthenticated).toBe(false);
  });

  it('registerOpen surfaces a duplicate-user failure', async () => {
    const client = createTestClient();
    await expect(
      client.auth.registerOpen({
        email: 'taken@example.com',
        password: 'password123',
        firstName: 'Taken',
        lastName: 'User',
        appId: 'test-app-id',
        platform: 'web',
        deviceInfo: 'test',
      }),
    ).rejects.toThrow();
  });

  it('registerWithToken normalizes a token-less RegistrationResponseDto', async () => {
    const client = createTestClient();
    const result = await client.auth.registerWithToken({
      registrationToken: 'valid-token',
      email: 'token@example.com',
      password: 'password123',
      firstName: 'Token',
      lastName: 'Reg',
      appId: 'test-app-id',
      platform: 'web',
      deviceInfo: 'test',
    });

    expect(result.userId).toBe('user-token-1');
    expect(result.email).toBe('token@example.com');
    // Registration succeeded but did NOT authenticate — callers must login with credentials
    expect(result.jwtToken).toBe('');
    expect(client.session.isAuthenticated).toBe(false);
  });

  it('registerWithToken stores the session when tokens are returned', async () => {
    const client = createTestClient();
    const result = await client.auth.registerWithToken({
      registrationToken: 'token-with-jwt',
      email: 'jwt@example.com',
      password: 'password123',
      firstName: 'Jwt',
      lastName: 'Reg',
      appId: 'test-app-id',
      platform: 'web',
      deviceInfo: 'test',
    });

    expect(result.jwtToken).toBeTruthy();
  });

  it('registerWithToken throws on a rejected token (200 with success=false)', async () => {
    const client = createTestClient();
    await expect(
      client.auth.registerWithToken({
        registrationToken: 'rejected-token',
        email: 'rejected@example.com',
        password: 'password123',
        firstName: 'Rejected',
        lastName: 'Reg',
        appId: 'test-app-id',
        platform: 'web',
        deviceInfo: 'test',
      }),
    ).rejects.toThrow('Token already used.');
  });

  it('twoFactor.getConfiguration returns the app-level 2FA configuration', async () => {
    const client = createTestClient();
    const config = await client.twoFactor.getConfiguration('test-app-id');

    expect(config).not.toBeNull();
    expect(config?.isEnabled).toBe(true);
    expect(config?.availableMethods[0]?.providerType).toBe('Email');
    expect(config?.codeValiditySeconds).toBe(300);
  });
});
