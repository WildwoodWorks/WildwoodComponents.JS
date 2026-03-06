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
      })
    ).rejects.toThrow();
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
});
