'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWildwood } from './useWildwood.js';

export interface UseSessionReturn {
  isAuthenticated: boolean;
  isInitialized: boolean;
  accessToken: string | null;
  userId: string | null;
  userEmail: string | null;
  refreshToken: () => Promise<boolean>;
  touchSession: () => Promise<void>;
  onAppResumed: () => Promise<void>;
}

export function useSession(): UseSessionReturn {
  const client = useWildwood();
  const [isInitialized, setIsInitialized] = useState(client.session.isInitialized);
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsub = client.events.on('authChanged', () => {
      setTick((t) => t + 1);
    });

    if (!client.session.isInitialized) {
      const checkInit = setInterval(() => {
        if (client.session.isInitialized) {
          setIsInitialized(true);
          clearInterval(checkInit);
        }
      }, 50);
      return () => {
        unsub();
        clearInterval(checkInit);
      };
    }

    return unsub;
  }, [client]);

  const refreshToken = useCallback(async () => {
    return client.session.refreshToken();
  }, [client]);

  const touchSession = useCallback(async () => {
    return client.session.touchSession();
  }, [client]);

  const onAppResumed = useCallback(async () => {
    return client.session.onAppResumed();
  }, [client]);

  return {
    isAuthenticated: client.session.isAuthenticated,
    isInitialized,
    accessToken: client.session.accessToken,
    userId: client.session.userId,
    userEmail: client.session.userEmail,
    refreshToken,
    touchSession,
    onAppResumed,
  };
}
