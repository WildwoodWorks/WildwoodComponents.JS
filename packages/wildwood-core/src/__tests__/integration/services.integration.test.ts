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

  it('sendProxyMessage hits the proxy endpoint', async () => {
    const client = await createAuthenticatedClient();
    const response = await client.ai.sendProxyMessage({
      message: 'Hello proxy',
      configurationId: 'cfg-1',
    });

    expect(response.message).toBe('Proxy echo: Hello proxy');
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
    const sub = await client.appTier.getUserSubscription('test-app-id');

    expect(sub).toBeDefined();
    expect(sub?.tierName).toBe('Free');
  });

  it('getTier returns a single tier by id', async () => {
    const client = await createAuthenticatedClient();
    const tier = await client.appTier.getTier('tier-pro');

    expect(tier).not.toBeNull();
    expect(tier?.id).toBe('tier-pro');
    expect(tier?.name).toBe('Pro');
  });

  it('getAllTiers returns the full (non-public-only) tier list', async () => {
    const client = await createAuthenticatedClient();
    const tiers = await client.appTier.getAllTiers('test-app-id');

    expect(tiers).toHaveLength(3);
    expect(tiers[2].name).toBe('Internal');
  });
});

describe('Feedback service integration (msw)', () => {
  it('getWidgetConfig returns the app widget config', async () => {
    const client = await createAuthenticatedClient();
    const config = await client.feedback.getWidgetConfig('test-app-id');

    expect(config.isEnabled).toBe(true);
    expect(config.feedbackTypes).toContain('Bug');
  });

  it('submitFeedback returns the created record', async () => {
    const client = await createAuthenticatedClient();
    const created = await client.feedback.submitFeedback({
      appId: 'test-app-id',
      title: 'Something broke',
      description: 'Steps to reproduce...',
      feedbackType: 'Bug',
    });

    expect(created.id).toBe('feedback-1');
    expect(created.title).toBe('Something broke');
    expect(created.status).toBe('New');
  });

  it('submitFeedback works anonymously (no auth token)', async () => {
    const client = createWildwoodClient({
      baseUrl: 'https://test-api.example.com',
      appId: 'test-app-id',
      storage: 'memory',
    });
    const created = await client.feedback.submitFeedback({
      title: 'Anonymous report',
      description: 'No account here',
      feedbackType: 'Other',
      submitterEmail: 'anon@example.com',
    });

    expect(created.id).toBe('feedback-1');
  });

  it('checkDuplicate detects a potential duplicate', async () => {
    const client = await createAuthenticatedClient();
    const result = await client.feedback.checkDuplicate('This is a duplicate title', 'test-app-id');

    expect(result.hasPotentialDuplicate).toBe(true);
    expect(result.duplicateId).toBe('feedback-existing');
    expect(result.duplicateVoteCount).toBe(3);
  });

  it('checkDuplicate returns none for a unique title', async () => {
    const client = await createAuthenticatedClient();
    const result = await client.feedback.checkDuplicate('A totally unique title', 'test-app-id');

    expect(result.hasPotentialDuplicate).toBe(false);
  });

  it('voteFeedback returns the updated vote count', async () => {
    const client = await createAuthenticatedClient();
    const result = await client.feedback.voteFeedback('feedback-existing');

    expect(result.voteCount).toBe(4);
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
    client.events.on('authChanged', () => {
      authEvent = true;
    });

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
