'use client';

// Tracks the Web Notifications API permission in React state and exposes a request()
// action. Pair with useNotificationInbox({ browserNotifications: pref.browserEnabled &&
// permission === 'granted' }) to drive the browser channel.

import { useState, useEffect, useCallback } from 'react';
import {
  isBrowserNotificationSupported,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
} from '@wildwood/core';

export interface UseBrowserNotificationsReturn {
  /** Whether the Web Notifications API exists in this environment. */
  supported: boolean;
  /** Current permission, or 'unsupported'. */
  permission: NotificationPermission | 'unsupported';
  /** Prompts the user; resolves to (and stores) the resulting permission. */
  request: () => Promise<NotificationPermission | 'unsupported'>;
}

export function useBrowserNotifications(): UseBrowserNotificationsReturn {
  const supported = isBrowserNotificationSupported();
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission(),
  );

  // Re-sync on mount in case permission changed before hydration (SSR) or in another tab.
  useEffect(() => {
    setPermission(getBrowserNotificationPermission());
  }, []);

  const request = useCallback(async () => {
    const result = await requestBrowserNotificationPermission();
    setPermission(result);
    return result;
  }, []);

  return { supported, permission, request };
}
