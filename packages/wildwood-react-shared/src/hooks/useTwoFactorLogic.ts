'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWildwood } from './useWildwood.js';
import type { TwoFactorUserStatus, TwoFactorCredential, TrustedDevice } from '@wildwood/core';
import { useTwoFactor } from './useTwoFactor.js';

export type TwoFactorSettingsView =
  'overview' | 'enrollEmail' | 'enrollAuthenticator' | 'recoveryCodes' | 'trustedDevices';

export interface UseTwoFactorLogicOptions {
  onStatusChange?: (enabled: boolean) => void;
  /** Platform-specific confirmation - return a Promise<boolean> that resolves true if user confirms */
  confirmAction?: (title: string, message: string) => Promise<boolean>;
  /**
   * The host's app. When given, the app's 2FA configuration is read so the screen can say when
   * the app does not enforce two-factor (sign-in would never ask for a code). Omitted → no check,
   * as in .NET, where the notice only appears when the host names its app.
   */
  appId?: string;
}

export interface UseTwoFactorLogicReturn {
  // State
  view: TwoFactorSettingsView;
  emailCredentialId: string;
  emailCode: string;
  authenticatorCredentialId: string;
  authenticatorCode: string;
  authenticatorQrUri: string;
  authenticatorSecret: string;
  recoveryCodes: string[];
  recoveryCodeCount: number;
  successMessage: string;
  /**
   * The named app has no 2FA provider enabled, so its sign-in never asks for a second factor.
   * Screens show the "app-not-enforcing" notice and offer no new enrollment (only removal of
   * methods the user already has) — offering it would display "Enabled" for protection that does
   * not exist. Port of .NET TwoFactorSettingsComponent `_appDoesNotEnforce`.
   */
  appDoesNotEnforce: boolean;

  // From useTwoFactor
  status: TwoFactorUserStatus | null;
  credentials: TwoFactorCredential[];
  trustedDevices: TrustedDevice[];
  loading: boolean;
  error: string | null;
  revokeTrustedDevice: (deviceId: string) => Promise<boolean>;

  // Handlers
  handleEnrollEmail: () => Promise<void>;
  handleVerifyEmail: () => Promise<void>;
  handleBeginAuthenticator: () => Promise<void>;
  handleCompleteAuthenticator: () => Promise<void>;
  handleRemoveCredential: (credentialId: string) => Promise<void>;
  handleViewRecoveryCodes: () => Promise<void>;
  handleRegenerateCodes: () => Promise<void>;
  handleViewTrustedDevices: () => Promise<void>;
  handleRevokeAllDevices: () => Promise<void>;
  handleSetPrimary: (credentialId: string) => Promise<void>;
  cancelView: () => void;
  setEmailCode: (value: string) => void;
  setAuthenticatorCode: (value: string) => void;
}

export function useTwoFactorLogic(options: UseTwoFactorLogicOptions = {}): UseTwoFactorLogicReturn {
  const { onStatusChange, confirmAction, appId } = options;
  const client = useWildwood();

  const [appDoesNotEnforce, setAppDoesNotEnforce] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setAppDoesNotEnforce(false);
    if (!appId) return;
    // getConfiguration answers null on any failure, which leaves the screen as it always was.
    client.twoFactor
      .getConfiguration(appId)
      .catch(() => null)
      .then((config) => {
        if (!cancelled) setAppDoesNotEnforce(config?.isEnabled === false);
      });
    return () => {
      cancelled = true;
    };
  }, [appId, client]);

  // If the session was restricted until the user enrolled (the app requires two-factor), enrolling
  // is what lifts it: refresh now so the rest of the app works without waiting for a timed refresh.
  // Failure is not fatal here; the auth flow's own completion step reports it.
  const liftEnrollmentRestriction = useCallback(async () => {
    if (client.session.isTwoFactorEnrollmentPending) {
      await client.session.completeTwoFactorEnrollment().catch(() => false);
    }
  }, [client]);

  const {
    status,
    credentials,
    trustedDevices,
    loading,
    error,
    getStatus,
    getCredentials,
    enrollEmail,
    verifyEmailEnrollment,
    beginAuthenticatorEnrollment,
    completeAuthenticatorEnrollment,
    removeCredential,
    setPrimaryCredential,
    getRecoveryCodeInfo,
    regenerateRecoveryCodes,
    getTrustedDevices,
    revokeTrustedDevice,
    revokeAllTrustedDevices,
  } = useTwoFactor();

  const [view, setView] = useState<TwoFactorSettingsView>('overview');
  const [emailCredentialId, setEmailCredentialId] = useState('');
  const [emailCode, setEmailCodeState] = useState('');
  const [authenticatorCredentialId, setAuthenticatorCredentialId] = useState('');
  const [authenticatorCode, setAuthenticatorCodeState] = useState('');
  const [authenticatorQrUri, setAuthenticatorQrUri] = useState('');
  const [authenticatorSecret, setAuthenticatorSecret] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryCodeCount, setRecoveryCodeCount] = useState(0);
  const [successMessage, setSuccessMessage] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    getStatus();
    getCredentials();
  }, [getStatus, getCredentials]);

  const handleEnrollEmail = useCallback(async () => {
    setSuccessMessage('');
    try {
      const result = await enrollEmail();
      setEmailCredentialId(result.credentialId);
      setView('enrollEmail');
      setSuccessMessage('Verification code sent to your email');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to enroll email');
    }
  }, [enrollEmail]);

  const handleVerifyEmail = useCallback(async () => {
    try {
      await verifyEmailEnrollment(emailCredentialId, emailCode);
      setEmailCodeState('');
      setEmailCredentialId('');
      setView('overview');
      setSuccessMessage('Email 2FA enrolled successfully');
      await getStatus();
      await liftEnrollmentRestriction();
      onStatusChange?.(true);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to verify email');
    }
  }, [emailCredentialId, emailCode, verifyEmailEnrollment, getStatus, liftEnrollmentRestriction, onStatusChange]);

  const handleBeginAuthenticator = useCallback(async () => {
    setSuccessMessage('');
    try {
      const result = await beginAuthenticatorEnrollment();
      setAuthenticatorCredentialId(result.credentialId);
      setAuthenticatorQrUri(result.qrCodeDataUrl ?? '');
      setAuthenticatorSecret(result.manualEntryKey ?? '');
      setView('enrollAuthenticator');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to begin authenticator enrollment');
    }
  }, [beginAuthenticatorEnrollment]);

  const handleCompleteAuthenticator = useCallback(async () => {
    try {
      await completeAuthenticatorEnrollment(authenticatorCredentialId, authenticatorCode);
      setAuthenticatorCodeState('');
      setAuthenticatorCredentialId('');
      setView('overview');
      setSuccessMessage('Authenticator enrolled successfully');
      await getStatus();
      await liftEnrollmentRestriction();
      onStatusChange?.(true);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to complete authenticator enrollment');
    }
  }, [
    authenticatorCredentialId,
    authenticatorCode,
    completeAuthenticatorEnrollment,
    getStatus,
    liftEnrollmentRestriction,
    onStatusChange,
  ]);

  const handleRemoveCredential = useCallback(
    async (credentialId: string) => {
      if (confirmAction) {
        const confirmed = await confirmAction(
          'Remove Credential',
          'Are you sure you want to remove this two-factor method?',
        );
        if (!confirmed) return;
      }
      try {
        await removeCredential(credentialId);
        const updatedCreds = await getCredentials();
        await getStatus();
        if (!updatedCreds || updatedCreds.length === 0) {
          onStatusChange?.(false);
        }
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Failed to remove credential');
      }
    },
    [confirmAction, removeCredential, getCredentials, getStatus, onStatusChange],
  );

  const handleViewRecoveryCodes = useCallback(async () => {
    try {
      const info = await getRecoveryCodeInfo();
      setRecoveryCodeCount(info.remaining ?? 0);
      setView('recoveryCodes');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to get recovery code info');
    }
  }, [getRecoveryCodeInfo]);

  const handleRegenerateCodes = useCallback(async () => {
    if (confirmAction) {
      const confirmed = await confirmAction(
        'Regenerate Codes',
        'This will invalidate all existing recovery codes. Continue?',
      );
      if (!confirmed) return;
    }
    try {
      const result = await regenerateRecoveryCodes();
      setRecoveryCodes(result.codes ?? []);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to regenerate recovery codes');
    }
  }, [confirmAction, regenerateRecoveryCodes]);

  const handleViewTrustedDevices = useCallback(async () => {
    await getTrustedDevices();
    setView('trustedDevices');
  }, [getTrustedDevices]);

  const handleRevokeAllDevices = useCallback(async () => {
    if (confirmAction) {
      const confirmed = await confirmAction(
        'Revoke All Devices',
        'Are you sure you want to revoke all trusted devices?',
      );
      if (!confirmed) return;
    }
    try {
      await revokeAllTrustedDevices();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to revoke all trusted devices');
    }
  }, [confirmAction, revokeAllTrustedDevices]);

  const handleSetPrimary = useCallback(
    async (credentialId: string) => {
      try {
        await setPrimaryCredential(credentialId);
        setSuccessMessage('Primary credential updated');
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Failed to set primary credential');
      }
    },
    [setPrimaryCredential],
  );

  const cancelView = useCallback(() => {
    setRecoveryCodes([]);
    setEmailCredentialId('');
    setEmailCodeState('');
    setAuthenticatorCredentialId('');
    setAuthenticatorCodeState('');
    setAuthenticatorQrUri('');
    setAuthenticatorSecret('');
    setView('overview');
  }, []);

  const setEmailCode = useCallback((value: string) => {
    setEmailCodeState(value.replace(/\D/g, '').slice(0, 6));
  }, []);

  const setAuthenticatorCode = useCallback((value: string) => {
    setAuthenticatorCodeState(value.replace(/\D/g, '').slice(0, 6));
  }, []);

  return {
    // State
    view,
    emailCredentialId,
    emailCode,
    authenticatorCredentialId,
    authenticatorCode,
    authenticatorQrUri,
    authenticatorSecret,
    recoveryCodes,
    recoveryCodeCount,
    successMessage,
    appDoesNotEnforce,

    // From useTwoFactor
    status,
    credentials,
    trustedDevices,
    loading,
    error: localError ?? error,
    revokeTrustedDevice,

    // Handlers
    handleEnrollEmail,
    handleVerifyEmail,
    handleBeginAuthenticator,
    handleCompleteAuthenticator,
    handleRemoveCredential,
    handleViewRecoveryCodes,
    handleRegenerateCodes,
    handleViewTrustedDevices,
    handleRevokeAllDevices,
    handleSetPrimary,
    cancelView,
    setEmailCode,
    setAuthenticatorCode,
  };
}
