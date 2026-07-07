import { describe, it, expect, vi } from 'vitest';
import { NotificationInboxService } from '../notifications/notificationInboxService.js';
import { WildwoodEventEmitter } from '../events/eventEmitter.js';
import type { WildwoodConfig } from '../client/types.js';

const config: WildwoodConfig = { baseUrl: 'https://api.test', appId: 'app-1', apiKey: 'pk-1' };

function makeService(token: string | null = 'jwt-1') {
  const events = new WildwoodEventEmitter();
  const sessionExpired = vi.fn();
  events.on('sessionExpired', sessionExpired);
  const service = new NotificationInboxService(config, events, () => token);
  return { service, sessionExpired };
}

const notification = {
  id: 'n-1',
  type: 'award',
  title: 'New award',
  message: 'You won a grant.',
  link: '/awards/1',
  appId: 'app-1',
  eventType: 'award.created',
  userId: 'user-1',
  status: 'Unread',
  createdAt: '2026-07-07T00:00:00Z',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('NotificationInboxService', () => {
  it('lists notifications with auth headers', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([notification]));
    const { service } = makeService();

    const list = await service.list({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/notifications',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-1',
          'X-API-Key': 'pk-1',
        }),
      }),
    );
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('n-1');
  });

  it('parses the unread count number', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(3));
    const { service } = makeService();

    expect(await service.getUnreadCount({ fetchImpl })).toBe(3);
    expect(fetchImpl).toHaveBeenCalledWith('https://api.test/api/notifications/count', expect.anything());
  });

  it('marks a single notification read via PUT', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));
    const { service } = makeService();

    expect(await service.markRead('n-1', { fetchImpl })).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/notifications/n-1/read',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('returns markedAsRead count from read-all', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ markedAsRead: 5 }));
    const { service } = makeService();

    expect(await service.markAllRead({ fetchImpl })).toBe(5);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/notifications/read-all',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('deletes a notification via DELETE', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));
    const { service } = makeService();

    expect(await service.remove('n-1', { fetchImpl })).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/notifications/n-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('gets preferences with the appId query', async () => {
    const pref = { appId: 'app-1', emailEnabled: true, smsEnabled: false, pushEnabled: true, eventOptOutsJson: null };
    const fetchImpl = vi.fn(async () => jsonResponse(pref));
    const { service } = makeService();

    const result = await service.getPreferences('app-1', { fetchImpl });
    expect(result).toEqual(pref);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/notifications/preferences?appId=app-1',
      expect.anything(),
    );
  });

  it('updates preferences via PUT with a JSON body', async () => {
    const pref = { appId: 'app-1', emailEnabled: false, smsEnabled: false, pushEnabled: true };
    const fetchImpl = vi.fn(async () => jsonResponse(pref));
    const { service } = makeService();

    const saved = await service.updatePreferences(pref, { fetchImpl });
    expect(saved).toEqual(pref);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual(pref);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('degrades gracefully on 403 without firing sessionExpired', async () => {
    const forbidden = vi.fn(async () => new Response('', { status: 403 }));
    const { service, sessionExpired } = makeService();

    expect(await service.list({ fetchImpl: forbidden })).toEqual([]);
    expect(await service.getUnreadCount({ fetchImpl: forbidden })).toBe(0);
    expect(await service.markAllRead({ fetchImpl: forbidden })).toBe(0);
    expect(await service.getPreferences('app-1', { fetchImpl: forbidden })).toBeNull();
    expect(sessionExpired).not.toHaveBeenCalled();
  });

  it('fires sessionExpired once per token on 401', async () => {
    const unauthorized = vi.fn(async () => new Response('', { status: 401 }));
    const { service, sessionExpired } = makeService();

    await service.list({ fetchImpl: unauthorized });
    await service.getUnreadCount({ fetchImpl: unauthorized });
    expect(sessionExpired).toHaveBeenCalledTimes(1);
  });

  it('returns null (retain last known) on a transient 5xx failure', async () => {
    const serverError = vi.fn(async () => new Response('', { status: 503 }));
    const { service, sessionExpired } = makeService();

    expect(await service.list({ fetchImpl: serverError })).toBeNull();
    expect(await service.getUnreadCount({ fetchImpl: serverError })).toBeNull();
    // A transient failure is not an auth failure.
    expect(sessionExpired).not.toHaveBeenCalled();
  });

  it('returns null (retain last known) when the network throws', async () => {
    const networkError = vi.fn(async () => {
      throw new Error('network down');
    });
    const { service } = makeService();

    expect(await service.list({ fetchImpl: networkError })).toBeNull();
    expect(await service.getUnreadCount({ fetchImpl: networkError })).toBeNull();
  });

  it('round-trips browserEnabled through preferences', async () => {
    const pref = {
      appId: 'app-1',
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: false,
      browserEnabled: true,
    };
    const fetchImpl = vi.fn(async () => jsonResponse(pref));
    const { service } = makeService();

    const saved = await service.updatePreferences(pref, { fetchImpl });
    expect(saved?.browserEnabled).toBe(true);
    expect(JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string).browserEnabled).toBe(true);
  });
});
