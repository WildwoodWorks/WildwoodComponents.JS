'use client';

// Per-app notification delivery preferences (email / SMS / push opt-outs) for the
// authenticated user. Follows the useDocuments idiom: a disposed ref guards state
// writes, load-on-mount, and a save() that surfaces failures via `error`.

import { useState, useEffect, useCallback, useRef } from 'react';
import type { UserNotificationPreference } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseNotificationPreferencesOptions {
  /** Override the API base INCLUDING the /api segment. Defaults to the client config. */
  apiBaseUrl?: string;
}

export interface UseNotificationPreferencesReturn {
  preferences: UserNotificationPreference | null;
  loading: boolean;
  error: string | null;
  /** Persists preferences; returns the saved record or null on failure (error is set). */
  save: (pref: UserNotificationPreference) => Promise<UserNotificationPreference | null>;
  refresh: () => Promise<void>;
}

export function useNotificationPreferences(
  appId: string,
  options?: UseNotificationPreferencesOptions,
): UseNotificationPreferencesReturn {
  const client = useWildwood();
  const apiBaseUrl = options?.apiBaseUrl;

  const [preferences, setPreferences] = useState<UserNotificationPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const disposedRef = useRef(false);

  const requestOptions = useCallback(() => ({ apiBaseUrl }), [apiBaseUrl]);

  const refresh = useCallback(async () => {
    const pref = await client.notificationInbox.getPreferences(appId, requestOptions());
    if (!disposedRef.current) {
      setPreferences(pref);
      setLoading(false);
    }
  }, [client, appId, requestOptions]);

  useEffect(() => {
    disposedRef.current = false;
    setLoading(true);
    void refresh();
    return () => {
      disposedRef.current = true;
    };
  }, [refresh]);

  const save = useCallback(
    async (pref: UserNotificationPreference): Promise<UserNotificationPreference | null> => {
      setError(null);
      try {
        const saved = await client.notificationInbox.updatePreferences(pref, requestOptions());
        if (!saved) {
          if (!disposedRef.current) setError('Failed to save notification preferences.');
          return null;
        }
        if (!disposedRef.current) setPreferences(saved);
        return saved;
      } catch (err) {
        if (!disposedRef.current) setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [client, requestOptions],
  );

  return { preferences, loading, error, save, refresh };
}
