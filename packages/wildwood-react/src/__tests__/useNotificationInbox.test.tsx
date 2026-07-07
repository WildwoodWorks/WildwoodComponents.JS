import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { AppNotification } from '@wildwood/core';
import { useNotificationInbox } from '../hooks/useNotificationInbox.js';
import { createTestClient, createWrapper } from './testUtils.js';

const n1: AppNotification = {
  id: '1',
  type: 'info',
  message: 'first',
  userId: 'u1',
  status: 'Unread',
  createdAt: '2026-07-07T00:00:00Z',
};
const n2: AppNotification = {
  id: '2',
  type: 'info',
  title: 'Title 2',
  message: 'second',
  userId: 'u1',
  status: 'Unread',
  createdAt: '2026-07-07T00:01:00Z',
};

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { Notification?: unknown }).Notification;
});

describe('useNotificationInbox', () => {
  it('loads the list and count on mount', async () => {
    const client = createTestClient();
    vi.spyOn(client.notificationInbox, 'list').mockResolvedValue([n1]);
    vi.spyOn(client.notificationInbox, 'getUnreadCount').mockResolvedValue(1);

    const { result } = renderHook(() => useNotificationInbox({ pollIntervalMs: 0 }), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.unreadCount).toBe(1);
  });

  it('retains the last known count and list when a poll returns a transient failure', async () => {
    const client = createTestClient();
    const listSpy = vi.spyOn(client.notificationInbox, 'list').mockResolvedValue([n1]);
    const countSpy = vi.spyOn(client.notificationInbox, 'getUnreadCount').mockResolvedValue(1);

    const { result } = renderHook(() => useNotificationInbox({ pollIntervalMs: 0 }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unreadCount).toBe(1);

    // Transient blip: the service signals failure with null for both calls.
    listSpy.mockResolvedValue(null);
    countSpy.mockResolvedValue(null);
    await act(async () => {
      await result.current.refresh();
    });

    // Previous data is retained — the badge did NOT drop to 0 and the list was not cleared.
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.notifications).toHaveLength(1);
  });

  it('seeds silently on first load, then fires a browser notification only for a new unread item', async () => {
    const ctor = vi.fn();
    class MockNotification {
      static permission = 'granted';
      static requestPermission = vi.fn(async () => 'granted');
      onclick: unknown = null;
      constructor(title: string, options?: unknown) {
        ctor(title, options);
      }
    }
    (window as unknown as { Notification: unknown }).Notification = MockNotification;

    const client = createTestClient();
    const listSpy = vi.spyOn(client.notificationInbox, 'list').mockResolvedValue([n1]);
    vi.spyOn(client.notificationInbox, 'getUnreadCount').mockResolvedValue(1);

    const { result } = renderHook(() => useNotificationInbox({ pollIntervalMs: 0, browserNotifications: true }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Pre-existing item present on first load must NOT raise a notification.
    expect(ctor).not.toHaveBeenCalled();

    // A genuinely new unread item arrives on the next refresh.
    listSpy.mockResolvedValue([n2, n1]);
    await act(async () => {
      await result.current.refresh();
    });

    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor).toHaveBeenCalledWith('Title 2', expect.objectContaining({ body: 'second', tag: '2' }));
  });

  it('does not fire browser notifications when the option is disabled', async () => {
    const ctor = vi.fn();
    class MockNotification {
      static permission = 'granted';
      onclick: unknown = null;
      constructor(title: string, options?: unknown) {
        ctor(title, options);
      }
    }
    (window as unknown as { Notification: unknown }).Notification = MockNotification;

    const client = createTestClient();
    const listSpy = vi.spyOn(client.notificationInbox, 'list').mockResolvedValue([n1]);
    vi.spyOn(client.notificationInbox, 'getUnreadCount').mockResolvedValue(1);

    const { result } = renderHook(() => useNotificationInbox({ pollIntervalMs: 0 }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    listSpy.mockResolvedValue([n2, n1]);
    await act(async () => {
      await result.current.refresh();
    });

    expect(ctor).not.toHaveBeenCalled();
  });
});
