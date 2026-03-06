'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ToastNotification, NotificationType } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseNotificationsReturn {
  toasts: readonly ToastNotification[];
  show: (message: string, type?: NotificationType, title?: string, durationMs?: number) => string;
  success: (message: string, title?: string) => string;
  error: (message: string, title?: string) => string;
  warning: (message: string, title?: string) => string;
  info: (message: string, title?: string) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export function useNotifications(): UseNotificationsReturn {
  const client = useWildwood();
  const [toasts, setToasts] = useState<readonly ToastNotification[]>(client.notifications.getToasts());

  useEffect(() => {
    return client.notifications.subscribe(() => {
      setToasts([...client.notifications.getToasts()]);
    });
  }, [client]);

  return {
    toasts,
    show: useCallback(
      (...args: Parameters<typeof client.notifications.show>) => client.notifications.show(...args),
      [client],
    ),
    success: useCallback((msg: string, title?: string) => client.notifications.success(msg, title), [client]),
    error: useCallback((msg: string, title?: string) => client.notifications.error(msg, title), [client]),
    warning: useCallback((msg: string, title?: string) => client.notifications.warning(msg, title), [client]),
    info: useCallback((msg: string, title?: string) => client.notifications.info(msg, title), [client]),
    dismiss: useCallback((id: string) => client.notifications.dismiss(id), [client]),
    clear: useCallback(() => client.notifications.clear(), [client]),
  };
}
