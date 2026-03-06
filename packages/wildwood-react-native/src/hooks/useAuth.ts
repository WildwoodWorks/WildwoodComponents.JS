import { useState, useEffect, useCallback } from 'react';
import type { AuthenticationResponse, LoginRequest, RegistrationRequest } from '@wildwood/core';
import { useWildwood } from './useWildwood';

export interface UseAuthReturn {
  isAuthenticated: boolean;
  isInitialized: boolean;
  user: AuthenticationResponse | null;
  login: (request: LoginRequest) => Promise<AuthenticationResponse>;
  register: (request: RegistrationRequest) => Promise<AuthenticationResponse>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
}

export function useAuth(): UseAuthReturn {
  const client = useWildwood();
  const [user, setUser] = useState<AuthenticationResponse | null>(client.session.user);
  const [isInitialized, setIsInitialized] = useState(client.session.isInitialized);

  useEffect(() => {
    const unsub = client.events.on('authChanged', (authResponse: AuthenticationResponse | null) => {
      setUser(authResponse);
    });

    if (!client.session.isInitialized) {
      const checkInit = setInterval(() => {
        if (client.session.isInitialized) {
          setIsInitialized(true);
          setUser(client.session.user);
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

  const login = useCallback(async (request: LoginRequest) => {
    const response = await client.auth.login(request);
    if (response.jwtToken && !response.requiresTwoFactor) {
      await client.session.login(response);
    }
    return response;
  }, [client]);

  const register = useCallback(async (request: RegistrationRequest) => {
    return client.auth.register(request);
  }, [client]);

  const logout = useCallback(async () => {
    await client.auth.logout();
    await client.session.logout();
  }, [client]);

  const refreshToken = useCallback(async () => {
    return client.session.refreshToken();
  }, [client]);

  return {
    isAuthenticated: client.session.isAuthenticated,
    isInitialized,
    user,
    login,
    register,
    logout,
    refreshToken,
  };
}
