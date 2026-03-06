import { describe, it, expect } from 'vitest';
import './setup.js';
import { createWildwoodClient } from '../../index.js';

// Helper: create client and login to set auth tokens
async function createAuthenticatedClient() {
  const client = createWildwoodClient({
    baseUrl: 'https://test-api.example.com',
    appId: 'test-app-id',
    storage: 'memory',
  });
  await client.auth.login({
    email: 'user@example.com',
    password: 'password',
    appId: 'test-app-id',
    appVersion: '1.0.0',
    platform: 'web',
    deviceInfo: 'test',
  });
  return client;
}

describe('AI service integration (msw)', () => {
  it('getSessions returns session list', async () => {
    const client = await createAuthenticatedClient();
    const sessions = await client.ai.getSessions();

    expect(sessions).toHaveLength(2);
    expect(sessions[0].name).toBe('Test Session');
  });

  it('sendMessage returns response', async () => {
    const client = await createAuthenticatedClient();
    const response = await client.ai.sendMessage({
      message: 'Hello AI',
      sessionId: 'session-1',
    });

    expect(response.message).toBe('Echo: Hello AI');
  });

  it('getFlowDefinitions returns flows', async () => {
    const client = await createAuthenticatedClient();
    const flows = await client.ai.getFlowDefinitions();

    expect(flows).toHaveLength(1);
    expect(flows[0].name).toBe('Test Flow');
  });
});

describe('Disclaimer service integration (msw)', () => {
  it('getPendingDisclaimers returns response', async () => {
    const client = await createAuthenticatedClient();
    const result = await client.disclaimer.getPendingDisclaimers('test-app-id');

    expect(result.disclaimers).toBeDefined();
  });

  it('acceptDisclaimer succeeds', async () => {
    const client = await createAuthenticatedClient();
    const result = await client.disclaimer.acceptDisclaimer('disc-1', 'v1');

    expect(result.success).toBe(true);
  });
});

describe('AppTier service integration (msw)', () => {
  it('getTiers returns tier list', async () => {
    const client = await createAuthenticatedClient();
    const tiers = await client.appTier.getTiers('test-app-id');

    expect(tiers).toHaveLength(2);
    expect(tiers[0].name).toBe('Free');
    expect(tiers[1].name).toBe('Pro');
  });

  it('getUserSubscription returns current info', async () => {
    const client = await createAuthenticatedClient();
    const sub = await client.appTier.getUserSubscription();

    expect(sub).toBeDefined();
    expect(sub?.tierName).toBe('Free');
  });
});

describe('Cross-service integration (msw)', () => {
  it('login then access authenticated endpoints', async () => {
    const client = await createAuthenticatedClient();

    const sessions = await client.ai.getSessions();
    expect(sessions).toHaveLength(2);

    const disclaimers = await client.disclaimer.getPendingDisclaimers('test-app-id');
    expect(disclaimers).toBeDefined();
  });

  it('client events fire on auth change', async () => {
    const client = createWildwoodClient({
      baseUrl: 'https://test-api.example.com',
      appId: 'test-app-id',
      storage: 'memory',
    });

    let authEvent = false;
    client.events.on('authChanged', () => { authEvent = true; });

    await client.auth.login({
      email: 'user@example.com',
      password: 'password',
      appId: 'test-app-id',
      appVersion: '1.0.0',
      platform: 'web',
      deviceInfo: 'test',
    });

    expect(authEvent).toBe(true);
  });
});
