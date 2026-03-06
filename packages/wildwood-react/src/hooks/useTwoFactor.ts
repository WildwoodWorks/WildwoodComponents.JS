import { useState, useCallback } from 'react';
import type {
  TwoFactorUserStatus,
  TwoFactorCredential,
  AuthenticatorEnrollmentResult,
  EmailEnrollmentResult,
  RecoveryCodeInfo,
  RegenerateRecoveryCodesResult,
  TrustedDevice,
} from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseTwoFactorReturn {
  status: TwoFactorUserStatus | null;
  credentials: TwoFactorCredential[];
  trustedDevices: TrustedDevice[];
  loading: boolean;
  error: string | null;
  getStatus: () => Promise<TwoFactorUserStatus>;
  getCredentials: () => Promise<TwoFactorCredential[]>;
  enrollEmail: (email?: string) => Promise<EmailEnrollmentResult>;
  verifyEmailEnrollment: (credentialId: string, code: string) => Promise<boolean>;
  beginAuthenticatorEnrollment: (friendlyName?: string) => Promise<AuthenticatorEnrollmentResult>;
  completeAuthenticatorEnrollment: (credentialId: string, code: string) => Promise<boolean>;
  removeCredential: (credentialId: string) => Promise<boolean>;
  getRecoveryCodeInfo: () => Promise<RecoveryCodeInfo>;
  regenerateRecoveryCodes: () => Promise<RegenerateRecoveryCodesResult>;
  getTrustedDevices: () => Promise<TrustedDevice[]>;
  revokeTrustedDevice: (deviceId: string) => Promise<boolean>;
  revokeAllTrustedDevices: () => Promise<number>;
}

export function useTwoFactor(): UseTwoFactorReturn {
  const client = useWildwood();
  const [status, setStatus] = useState<TwoFactorUserStatus | null>(null);
  const [credentials, setCredentials] = useState<TwoFactorCredential[]>([]);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wrap = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getStatus = useCallback(async () => {
    const result = await client.twoFactor.getStatus();
    setStatus(result);
    return result;
  }, [client]);

  const getCredentials = useCallback(async () => {
    const result = await client.twoFactor.getCredentials();
    setCredentials(result);
    return result;
  }, [client]);

  const enrollEmail = useCallback(async (email?: string) => {
    return wrap(() => client.twoFactor.enrollEmail(email));
  }, [client, wrap]);

  const verifyEmailEnrollment = useCallback(async (credentialId: string, code: string) => {
    const result = await wrap(() => client.twoFactor.verifyEmailEnrollment(credentialId, code));
    await getCredentials();
    return result;
  }, [client, wrap, getCredentials]);

  const beginAuthenticatorEnrollment = useCallback(async (friendlyName?: string) => {
    return wrap(() => client.twoFactor.beginAuthenticatorEnrollment(friendlyName));
  }, [client, wrap]);

  const completeAuthenticatorEnrollment = useCallback(async (credentialId: string, code: string) => {
    const result = await wrap(() => client.twoFactor.completeAuthenticatorEnrollment(credentialId, code));
    await getCredentials();
    return result;
  }, [client, wrap, getCredentials]);

  const removeCredential = useCallback(async (credentialId: string) => {
    const result = await client.twoFactor.removeCredential(credentialId);
    await getCredentials();
    return result;
  }, [client, getCredentials]);

  const getRecoveryCodeInfo = useCallback(async () => {
    return client.twoFactor.getRecoveryCodeInfo();
  }, [client]);

  const regenerateRecoveryCodes = useCallback(async () => {
    return wrap(() => client.twoFactor.regenerateRecoveryCodes());
  }, [client, wrap]);

  const getTrustedDevices = useCallback(async () => {
    const result = await client.twoFactor.getTrustedDevices();
    setTrustedDevices(result);
    return result;
  }, [client]);

  const revokeTrustedDevice = useCallback(async (deviceId: string) => {
    const result = await client.twoFactor.revokeTrustedDevice(deviceId);
    await getTrustedDevices();
    return result;
  }, [client, getTrustedDevices]);

  const revokeAllTrustedDevices = useCallback(async () => {
    const result = await client.twoFactor.revokeAllTrustedDevices();
    setTrustedDevices([]);
    return result;
  }, [client]);

  return {
    status, credentials, trustedDevices, loading, error,
    getStatus, getCredentials, enrollEmail, verifyEmailEnrollment,
    beginAuthenticatorEnrollment, completeAuthenticatorEnrollment, removeCredential,
    getRecoveryCodeInfo, regenerateRecoveryCodes,
    getTrustedDevices, revokeTrustedDevice, revokeAllTrustedDevices,
  };
}
