'use client';

// Backend-connected notification inbox state for web + native UIs: the unread count
// and the full list, refreshed together on an interval (the backend has no SSE) plus
// per-item read/delete actions. Distinct from useNotifications (the toast queue).
//
// Mirrors the useDocuments polling idiom: a disposed ref guards state writes. Each
// poll tick refetches BOTH the list and the count so the bell badge and the dropdown
// never drift apart. Transient fetch failures (service returns null) retain the last
// good data instead of clearing it. Optionally raises a native browser notification
// for newly-arrived unread items.

import { useState, useEffect, useCallback, useRef } from 'react';
import { getBrowserNotificationPermission, showBrowserNotification, type AppNotification } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseNotificationInboxOptions {
  /** Override the API base INCLUDING the /api segment. Defaults to the client config. */
  apiBaseUrl?: string;
  /** Poll interval (ms) for a full list + count refresh. 0 disables polling. Default 45000. */
  pollIntervalMs?: number;
  /**
   * Raise a native browser notification when a NEW unread item arrives (default false).
   * Only fires when the Web Notifications permission is 'granted'. Pre-existing items
   * present on the first load are seeded silently — no notification is raised for them.
   */
  browserNotifications?: boolean;
}

export interface UseNotificationInboxReturn {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  /** Refetch the full list and the unread count. */
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<boolean>;
  /** Marks all read; returns the number of items marked. */
  markAllRead: () => Promise<number>;
  remove: (id: string) => Promise<boolean>;
}

export function useNotificationInbox(options?: UseNotificationInboxOptions): UseNotificationInboxReturn {
  const client = useWildwood();
  const { apiBaseUrl } = options ?? {};
  const pollIntervalMs = options?.pollIntervalMs ?? 45000;
  const browserNotifications = options?.browserNotifications ?? false;

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const disposedRef = useRef(false);

  // Ids already observed. Seeded (without firing) from the first successful load so we
  // never blast a notification for every pre-existing item on mount/login.
  const seenIdsRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  // Read the latest browserNotifications flag without recreating refresh (which would
  // re-run the mount effect and re-seed).
  const browserNotificationsRef = useRef(browserNotifications);
  useEffect(() => {
    browserNotificationsRef.current = browserNotifications;
  }, [browserNotifications]);

  const requestOptions = useCallback(() => ({ apiBaseUrl }), [apiBaseUrl]);

  // Reconcile a freshly-loaded list against the seen set, firing browser notifications
  // for genuinely-new unread items (only after the initial silent seed).
  const reconcile = useCallback((list: AppNotification[]) => {
    const seen = seenIdsRef.current;
    if (!seededRef.current) {
      for (const n of list) seen.add(n.id);
      seededRef.current = true;
      return;
    }
    const canNotify = browserNotificationsRef.current && getBrowserNotificationPermission() === 'granted';
    for (const n of list) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      if (canNotify && n.status === 'Unread') {
        const link = n.link;
        showBrowserNotification(n.title || 'New notification', {
          body: n.message,
          tag: n.id,
          onClick:
            link && typeof window !== 'undefined'
              ? () => {
                  window.location.assign(link);
                }
              : undefined,
        });
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [list, count] = await Promise.all([
        client.notificationInbox.list(requestOptions()),
        client.notificationInbox.getUnreadCount(requestOptions()),
      ]);
      if (disposedRef.current) return;
      // null = transient failure: retain the last good data rather than clobbering it.
      if (list !== null) {
        reconcile(list);
        setNotifications(list);
      }
      if (count !== null) {
        setUnreadCount(count);
      }
      setError(null);
      setLoading(false);
    } catch (err) {
      if (!disposedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    }
  }, [client, requestOptions, reconcile]);

  useEffect(() => {
    disposedRef.current = false;
    setLoading(true);
    void refresh();
    return () => {
      disposedRef.current = true;
    };
  }, [refresh]);

  // Poll a FULL refresh (list + count together) so the badge and list stay in sync.
  useEffect(() => {
    if (pollIntervalMs <= 0) return;
    const timer = setInterval(() => void refresh(), pollIntervalMs);
    return () => clearInterval(timer);
  }, [pollIntervalMs, refresh]);

  const markRead = useCallback(
    async (id: string): Promise<boolean> => {
      const ok = await client.notificationInbox.markRead(id, requestOptions());
      if (ok) await refresh();
      return ok;
    },
    [client, requestOptions, refresh],
  );

  const markAllRead = useCallback(async (): Promise<number> => {
    const count = await client.notificationInbox.markAllRead(requestOptions());
    await refresh();
    return count;
  }, [client, requestOptions, refresh]);

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const ok = await client.notificationInbox.remove(id, requestOptions());
      if (ok) await refresh();
      return ok;
    },
    [client, requestOptions, refresh],
  );

  return { notifications, unreadCount, loading, error, refresh, markRead, markAllRead, remove };
}
