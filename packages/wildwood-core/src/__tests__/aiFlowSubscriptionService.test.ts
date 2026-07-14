import { describe, it, expect, vi } from 'vitest';
import { AIFlowSubscriptionService } from '../ai/aiFlowSubscriptionService.js';
import { WildwoodEventEmitter } from '../events/eventEmitter.js';
import type { WildwoodConfig } from '../client/types.js';
import type { AIFlowSubscription } from '../ai/types.js';

const config: WildwoodConfig = { baseUrl: 'https://api.test', appId: 'app-1', apiKey: 'pk-1' };

function makeService(token: string | null = 'jwt-1') {
  const events = new WildwoodEventEmitter();
  const sessionExpired = vi.fn();
  events.on('sessionExpired', sessionExpired);
  const service = new AIFlowSubscriptionService(config, events, () => token);
  return { service, sessionExpired };
}

const subscription: AIFlowSubscription = {
  id: 'sub-1',
  flowId: 'flow-1',
  flowName: 'Trail Forecast',
  name: 'Angels Landing',
  inputJson: '{"location":"Angels Landing"}',
  scheduleCron: '0 6 * * *',
  scheduleTimezone: 'America/Denver',
  nextRunAt: '2026-07-13T12:00:00Z',
  isEnabled: true,
  notifyOnComplete: true,
  createdAt: '2026-07-12T00:00:00Z',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AIFlowSubscriptionService', () => {
  it('lists subscriptions with auth headers and requestedAppId', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([subscription]));
    const { service } = makeService();

    const subs = await service.getSubscriptions({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/ai/flows/subscriptions?requestedAppId=app-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-1',
          'X-API-Key': 'pk-1',
        }),
      }),
    );
    expect(subs).toHaveLength(1);
    expect(subs[0].id).toBe('sub-1');
  });

  it('returns [] on error/403 without throwing', async () => {
    const forbidden = vi.fn(async () => new Response('', { status: 403 }));
    const { service, sessionExpired } = makeService();

    expect(await service.getSubscriptions({ fetchImpl: forbidden })).toEqual([]);
    expect(sessionExpired).not.toHaveBeenCalled();
  });

  it('creates a subscription with a JSON body and returns it', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(subscription, 201));
    const { service } = makeService();

    const created = await service.create(
      { flowId: 'flow-1', name: 'Angels Landing', scheduleCron: '0 6 * * *' },
      { fetchImpl },
    );

    expect(created?.id).toBe('sub-1');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/ai/flows/subscriptions?requestedAppId=app-1');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      flowId: 'flow-1',
      name: 'Angels Landing',
      scheduleCron: '0 6 * * *',
    });
    expect(service.lastLimitMessage).toBeNull();
  });

  it('surfaces the 429 limit message via lastLimitMessage and returns null', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'Upgrade to add more favorites.' }, 429));
    const { service } = makeService();

    const created = await service.create({ flowId: 'flow-1', name: 'x', scheduleCron: '0 6 * * *' }, { fetchImpl });

    expect(created).toBeNull();
    expect(service.lastLimitMessage).toBe('Upgrade to add more favorites.');
  });

  it('falls back to the default limit message when the 429 body has no message', async () => {
    const fetchImpl = vi.fn(async () => new Response('not json', { status: 429 }));
    const { service } = makeService();

    await service.create({ flowId: 'flow-1', name: 'x', scheduleCron: '0 6 * * *' }, { fetchImpl });

    expect(service.lastLimitMessage).toBe("Your plan's favorites limit has been reached.");
  });

  it('resets lastLimitMessage at the start of each create', async () => {
    const limited = vi.fn(async () => jsonResponse({ message: 'limit' }, 429));
    const ok = vi.fn(async () => jsonResponse(subscription, 201));
    const { service } = makeService();

    await service.create({ flowId: 'flow-1', name: 'x', scheduleCron: '0 6 * * *' }, { fetchImpl: limited });
    expect(service.lastLimitMessage).toBe('limit');

    await service.create({ flowId: 'flow-1', name: 'y', scheduleCron: '0 6 * * *' }, { fetchImpl: ok });
    expect(service.lastLimitMessage).toBeNull();
  });

  it('updates a subscription via PUT to the id path', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ...subscription, name: 'Renamed' }));
    const { service } = makeService();

    const updated = await service.update('sub-1', { name: 'Renamed' }, { fetchImpl });

    expect(updated?.name).toBe('Renamed');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/ai/flows/subscriptions/sub-1?requestedAppId=app-1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Renamed' });
  });

  it('enables via the /enable path with no body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ...subscription, isEnabled: true }));
    const { service } = makeService();

    const result = await service.setEnabled('sub-1', true, { fetchImpl });

    expect(result?.isEnabled).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/ai/flows/subscriptions/sub-1/enable?requestedAppId=app-1');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('disables via the /disable path with no body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ...subscription, isEnabled: false }));
    const { service } = makeService();

    const result = await service.setEnabled('sub-1', false, { fetchImpl });

    expect(result?.isEnabled).toBe(false);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/api/ai/flows/subscriptions/sub-1/disable?requestedAppId=app-1');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('deletes and reports success from response.ok', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const { service } = makeService();

    expect(await service.delete('sub-1', { fetchImpl })).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/ai/flows/subscriptions/sub-1?requestedAppId=app-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('delete returns false when the response is not ok', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 }));
    const { service } = makeService();
    expect(await service.delete('sub-1', { fetchImpl })).toBe(false);
  });

  it('returns the latest run detail including outputJson', async () => {
    const detail = {
      id: 'run-1',
      flowId: 'flow-1',
      threadId: 'thread-1',
      triggerType: 'schedule',
      status: 'succeeded',
      createdAt: '2026-07-12T06:00:00Z',
      totalTokens: 42,
      inputJson: '{"location":"Angels Landing"}',
      outputJson: '{"forecast":"clear"}',
    };
    const fetchImpl = vi.fn(async () => jsonResponse(detail));
    const { service } = makeService();

    const result = await service.getLatestRun('sub-1', { fetchImpl });

    expect(result?.outputJson).toBe('{"forecast":"clear"}');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/ai/flows/subscriptions/sub-1/latest-run?requestedAppId=app-1',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer jwt-1' }) }),
    );
  });

  it('maps a 404 latest-run to null', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    const { service } = makeService();
    expect(await service.getLatestRun('sub-1', { fetchImpl })).toBeNull();
  });

  it('fires sessionExpired once per token on 401, and never on 403', async () => {
    const unauthorized = vi.fn(async () => new Response('', { status: 401 }));
    const { service, sessionExpired } = makeService();

    await service.getSubscriptions({ fetchImpl: unauthorized });
    await service.getSubscriptions({ fetchImpl: unauthorized });
    expect(sessionExpired).toHaveBeenCalledTimes(1);

    const forbidden = vi.fn(async () => new Response('', { status: 403 }));
    const { service: service2, sessionExpired: sessionExpired2 } = makeService();
    expect(
      await service2.create({ flowId: 'f', name: 'n', scheduleCron: '0 6 * * *' }, { fetchImpl: forbidden }),
    ).toBeNull();
    expect(sessionExpired2).not.toHaveBeenCalled();
  });

  it('re-arms the 401 signal when the token changes', async () => {
    const unauthorized = vi.fn(async () => new Response('', { status: 401 }));
    const events = new WildwoodEventEmitter();
    const sessionExpired = vi.fn();
    events.on('sessionExpired', sessionExpired);
    let token = 'jwt-1';
    const service = new AIFlowSubscriptionService(config, events, () => token);

    await service.getSubscriptions({ fetchImpl: unauthorized });
    await service.getSubscriptions({ fetchImpl: unauthorized });
    expect(sessionExpired).toHaveBeenCalledTimes(1);

    token = 'jwt-2';
    await service.getSubscriptions({ fetchImpl: unauthorized });
    expect(sessionExpired).toHaveBeenCalledTimes(2);
  });
});
