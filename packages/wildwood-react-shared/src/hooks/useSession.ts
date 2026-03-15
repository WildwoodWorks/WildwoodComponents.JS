'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AuthenticationResponse } from '@wildwood/core';
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
  const [user, setUser] = useState<AuthenticationResponse | null>(client.session.user);

  useEffect(() => {
    const unsubAuth = client.events.on('authChanged', (authResponse: AuthenticationResponse | null) => {
      setUser(authResponse);
    });

    const unsubExpired = client.events.on('sessionExpired', () => {
      setUser(null);
    });

    const unsubInit = client.events.on('sessionInitialized', () => {
      setIsInitialized(true);
      setUser(client.session.user);
    });

    // Sync if already initialized before listener attached
    if (client.session.isInitialized && !isInitialized) {
      setIsInitialized(true);
      setUser(client.session.user);
    }

    return () => {
      unsubAuth();
      unsubExpired();
      unsubInit();
    };
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshToken = useCallback(async () => {
    return client.session.refreshToken();
  }, [client]);

  const touchSession = useCallback(async () => {
    return client.session.touchSession();
  }, [client]);

  const onAppResumed = useCallback(async () => {
    return client.session.onAppResumed();
  }, [client]);

  // Derive isAuthenticated from React state so it's reactive
  const isAuthenticated = !!user && !!user.jwtToken;

  return {
    isAuthenticated,
    isInitialized,
    accessToken: user?.jwtToken ?? null,
    userId: user?.userId ?? user?.id ?? null,
    userEmail: user?.email ?? null,
    refreshToken,
    touchSession,
    onAppResumed,
  };
}
