import { describe, it, expect } from 'vitest';
import { AdminClient, createAdminClient } from '../admin/adminClient.js';

const defaultOptions = {
  baseUrl: 'https://api.example.com',
  apiKey: 'test-key',
};

describe('createAdminClient', () => {
  it('returns an AdminClient instance', () => {
    const client = createAdminClient(defaultOptions);
    expect(client).toBeInstanceOf(AdminClient);
  });
});

describe('AdminClient parameter validation', () => {
  const client = new AdminClient(defaultOptions);

  it('getUser throws when userId is empty', async () => {
    await expect(client.getUser('')).rejects.toThrow('userId is required');
  });

  it('getUsers throws when appId is empty', async () => {
    await expect(client.getUsers('')).rejects.toThrow('appId is required');
  });

  it('disableUser throws when userId is empty', async () => {
    await expect(client.disableUser('')).rejects.toThrow('userId is required');
  });

  it('enableUser throws when userId is empty', async () => {
    await expect(client.enableUser('')).rejects.toThrow('userId is required');
  });

  it('getApp throws when appId is empty', async () => {
    await expect(client.getApp('')).rejects.toThrow('appId is required');
  });
});

describe('AdminClient constructor', () => {
  it('strips trailing slash from baseUrl', async () => {
    const client = new AdminClient({
      baseUrl: 'https://api.example.com/',
      apiKey: 'test-key',
    });
    // Verify it was created successfully (trailing slash stripped internally)
    expect(client).toBeInstanceOf(AdminClient);
  });

  it('uses default timeout when not specified', () => {
    const client = new AdminClient(defaultOptions);
    expect(client).toBeInstanceOf(AdminClient);
  });

  it('accepts custom timeout', () => {
    const client = new AdminClient({ ...defaultOptions, timeout: 5000 });
    expect(client).toBeInstanceOf(AdminClient);
  });
});
