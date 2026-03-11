'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  AuthenticationResponse,
  LoginRequest,
  RegistrationRequest,
  AuthProvider,
  AuthenticationConfiguration,
  CaptchaConfiguration,
  TwoFactorSendCodeResponse,
  TwoFactorVerifyRequest,
  TwoFactorVerifyResponse,
} from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseAuthReturn {
  isAuthenticated: boolean;
  isInitialized: boolean;
  user: AuthenticationResponse | null;
  login: (request: LoginRequest) => Promise<AuthenticationResponse>;
  register: (request: RegistrationRequest) => Promise<AuthenticationResponse>;
  registerWithToken: (request: RegistrationRequest) => Promise<AuthenticationResponse>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  getAvailableProviders: (appId?: string) => Promise<AuthProvider[]>;
  getCaptchaConfiguration: (appId: string) => Promise<CaptchaConfiguration | null>;
  getAuthenticationConfiguration: (appId: string) => Promise<AuthenticationConfiguration | null>;
  validatePassword: (password: string, appId: string) => Promise<{ isValid: boolean; errorMessage: string }>;
  getPasswordRequirementsText: (config: AuthenticationConfiguration) => string;
  requestPasswordReset: (email: string, appId: string) => Promise<boolean>;
  resetPassword: (newPassword: string, confirmPassword: string, appId: string) => Promise<boolean>;
  validateLicenseToken: (token: string) => Promise<boolean>;
  hasRegistrationTokens: (appId: string) => Promise<boolean>;
  validateRegistrationToken: (token: string) => Promise<boolean>;
  getPasskeyAuthenticationOptions: (appId: string) => Promise<unknown>;
  verifyPasskeyAuthentication: (appId: string, credential: unknown) => Promise<AuthenticationResponse>;
  getPasskeyRegistrationOptions: (appId: string) => Promise<unknown>;
  completePasskeyRegistration: (appId: string, credential: unknown) => Promise<void>;
  sendTwoFactorCode: (sessionId: string) => Promise<TwoFactorSendCodeResponse>;
  verifyTwoFactorCode: (request: TwoFactorVerifyRequest) => Promise<TwoFactorVerifyResponse>;
  verifyTwoFactorRecoveryCode: (
    sessionId: string,
    recoveryCode: string,
    ipAddress: string,
  ) => Promise<TwoFactorVerifyResponse>;
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

  const login = useCallback(
    async (request: LoginRequest) => {
      const response = await client.auth.login(request);
      if (response.jwtToken && !response.requiresTwoFactor) {
        await client.session.login(response);
      }
      return response;
    },
    [client],
  );

  const register = useCallback(
    async (request: RegistrationRequest) => {
      return client.auth.register(request);
    },
    [client],
  );

  const registerWithToken = useCallback(
    async (request: RegistrationRequest) => {
      return client.auth.registerWithToken(request);
    },
    [client],
  );

  const logout = useCallback(async () => {
    await client.auth.logout();
    await client.session.logout();
  }, [client]);

  const refreshToken = useCallback(async () => {
    return client.session.refreshToken();
  }, [client]);

  const getAvailableProviders = useCallback(
    async (appId?: string) => {
      return client.auth.getAvailableProviders(appId);
    },
    [client],
  );

  const getCaptchaConfiguration = useCallback(
    async (appId: string) => {
      return client.auth.getCaptchaConfiguration(appId);
    },
    [client],
  );

  const getAuthenticationConfiguration = useCallback(
    async (appId: string) => {
      return client.auth.getAuthenticationConfiguration(appId);
    },
    [client],
  );

  const validatePassword = useCallback(
    async (password: string, appId: string) => {
      return client.auth.validatePassword(password, appId);
    },
    [client],
  );

  const getPasswordRequirementsText = useCallback(
    (config: AuthenticationConfiguration) => {
      return client.auth.getPasswordRequirementsText(config);
    },
    [client],
  );

  const requestPasswordReset = useCallback(
    async (email: string, appId: string) => {
      return client.auth.requestPasswordReset(email, appId);
    },
    [client],
  );

  const resetPassword = useCallback(
    async (newPassword: string, confirmPassword: string, appId: string) => {
      return client.auth.resetPassword(newPassword, confirmPassword, appId);
    },
    [client],
  );

  const validateLicenseToken = useCallback(
    async (token: string) => {
      return client.auth.validateLicenseToken(token);
    },
    [client],
  );

  const hasRegistrationTokens = useCallback(
    async (appId: string) => {
      return client.auth.hasRegistrationTokens(appId);
    },
    [client],
  );

  const validateRegistrationToken = useCallback(
    async (token: string) => {
      return client.auth.validateRegistrationToken(token);
    },
    [client],
  );

  const getPasskeyAuthenticationOptions = useCallback(
    async (appId: string) => {
      return client.auth.getPasskeyAuthenticationOptions(appId);
    },
    [client],
  );

  const verifyPasskeyAuthentication = useCallback(
    async (appId: string, credential: unknown) => {
      return client.auth.verifyPasskeyAuthentication(appId, credential);
    },
    [client],
  );

  const getPasskeyRegistrationOptions = useCallback(
    async (appId: string) => {
      return client.auth.getPasskeyRegistrationOptions(appId);
    },
    [client],
  );

  const completePasskeyRegistration = useCallback(
    async (appId: string, credential: unknown) => {
      return client.auth.completePasskeyRegistration(appId, credential);
    },
    [client],
  );

  const sendTwoFactorCode = useCallback(
    async (sessionId: string) => {
      return client.auth.sendTwoFactorCode(sessionId);
    },
    [client],
  );

  const verifyTwoFactorCode = useCallback(
    async (request: TwoFactorVerifyRequest) => {
      const result = await client.auth.verifyTwoFactorCode(request);
      if (result.success && result.authResponse) {
        await client.session.login(result.authResponse);
      }
      return result;
    },
    [client],
  );

  const verifyTwoFactorRecoveryCode = useCallback(
    async (sessionId: string, recoveryCode: string, ipAddress: string) => {
      const result = await client.auth.verifyTwoFactorRecoveryCode(sessionId, recoveryCode, ipAddress);
      if (result.success && result.authResponse) {
        await client.session.login(result.authResponse);
      }
      return result;
    },
    [client],
  );

  // Derive isAuthenticated from React state so it's reactive.
  // Reading client.session.isAuthenticated directly is a non-reactive getter
  // that won't trigger re-renders when auth state changes.
  const isAuthenticated = !!user && !!user.jwtToken;

  return {
    isAuthenticated,
    isInitialized,
    user,
    login,
    register,
    registerWithToken,
    logout,
    refreshToken,
    getAvailableProviders,
    getCaptchaConfiguration,
    getAuthenticationConfiguration,
    validatePassword,
    getPasswordRequirementsText,
    requestPasswordReset,
    resetPassword,
    validateLicenseToken,
    hasRegistrationTokens,
    validateRegistrationToken,
    getPasskeyAuthenticationOptions,
    verifyPasskeyAuthentication,
    getPasskeyRegistrationOptions,
    completePasskeyRegistration,
    sendTwoFactorCode,
    verifyTwoFactorCode,
    verifyTwoFactorRecoveryCode,
  };
}
