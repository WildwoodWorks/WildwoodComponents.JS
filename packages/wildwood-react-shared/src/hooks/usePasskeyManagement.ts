'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { WildwoodError } from '@wildwood/core';
import type { UserPasskey } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

/**
 * Runs the platform's passkey creation ceremony over the server's registration options and resolves
 * to the credential JSON `completePasskeyRegistration` expects (base64url fields). React supplies a
 * `navigator.credentials.create` adapter; a native host supplies its own. Rejecting with an Error
 * whose message is user-facing ("Registration was cancelled or timed out.") is the contract.
 */
export type PasskeyCredentialCreator = (options: unknown) => Promise<unknown>;

export interface UsePasskeyManagementOptions {
  /** Defaults to the client's configured appId. */
  appId?: string;
  /** The creation ceremony. Without one, passkeys can be listed, renamed and removed but not added. */
  createCredential?: PasskeyCredentialCreator;
  /** Called after a passkey is added, renamed or removed. */
  onPasskeysChanged?: () => void;
}

export interface UsePasskeyManagementReturn {
  /** The first enabled-check + list load has finished. */
  loaded: boolean;
  /** Passkeys are enabled for the app. */
  appEnabled: boolean;
  /** A creation ceremony was supplied, so `register` can work. */
  canRegister: boolean;
  passkeys: UserPasskey[];
  loading: boolean;
  error: string | null;
  successMessage: string | null;
  refresh: () => Promise<void>;
  register: (friendlyName?: string) => Promise<boolean>;
  rename: (passkeyId: string, friendlyName: string) => Promise<boolean>;
  remove: (passkey: UserPasskey) => Promise<boolean>;
  clearMessages: () => void;
}

/** The name to show: the user's own name for it, else the kind of authenticator (same rule as .NET `UserPasskey.DisplayName`). */
export function passkeyDisplayName(passkey: Pick<UserPasskey, 'friendlyName' | 'isPlatformAuthenticator'>): string {
  const name = passkey.friendlyName?.trim();
  if (name) return name;
  return passkey.isPlatformAuthenticator ? 'This device (built-in)' : 'Security key';
}

/** The API's own message when it sent one, the ceremony's message for a ceremony error, else the fallback. */
function messageFor(err: unknown, fallback: string): string {
  if (err instanceof WildwoodError) {
    const body = err.details;
    const apiSaidSomething =
      !!body &&
      typeof body === 'object' &&
      ['message', 'errorMessage', 'error'].some((k) => typeof (body as Record<string, unknown>)[k] === 'string');
    return apiSaidSomething && err.message ? err.message : fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * The signed-in user's own passkeys: list, add, rename and remove. Port of .NET
 * `PasskeyManagementComponent` + `PasskeyManagementService`; DOM-free, so React and React Native share it.
 */
export function usePasskeyManagement(options: UsePasskeyManagementOptions = {}): UsePasskeyManagementReturn {
  const client = useWildwood();
  const appId = options.appId ?? client.config.appId ?? '';
  const { createCredential } = options;
  const onChangedRef = useRef(options.onPasskeysChanged);
  onChangedRef.current = options.onPasskeysChanged;

  const [loaded, setLoaded] = useState(false);
  const [appEnabled, setAppEnabled] = useState(false);
  const [passkeys, setPasskeys] = useState<UserPasskey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);
    (async () => {
      if (!appId) {
        if (!cancelled) setLoaded(true);
        return;
      }
      const enabled = await client.auth.isPasskeyEnabled(appId);
      if (cancelled) return;
      setAppEnabled(enabled);
      if (enabled) {
        try {
          const list = await client.auth.listPasskeys(appId);
          if (!cancelled) setPasskeys(list);
        } catch (err) {
          if (!cancelled) setError(messageFor(err, 'Could not load your passkeys.'));
        }
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [appId, client]);

  /** Runs one action with the shared loading/error/success bookkeeping. */
  const run = useCallback(async (fallback: string, action: () => Promise<string>): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const success = await action();
      if (mounted.current) setSuccessMessage(success);
      onChangedRef.current?.();
      return true;
    } catch (err) {
      if (mounted.current) setError(messageFor(err, fallback));
      return false;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    const list = await client.auth.listPasskeys(appId);
    if (mounted.current) setPasskeys(list);
  }, [appId, client]);

  const refresh = useCallback(async () => {
    if (!appId || !appEnabled) return;
    setError(null);
    try {
      await reload();
    } catch (err) {
      if (mounted.current) setError(messageFor(err, 'Could not load your passkeys.'));
    }
  }, [appId, appEnabled, reload]);

  const register = useCallback(
    (friendlyName?: string) => {
      if (!createCredential) {
        setError('Passkeys cannot be added on this device.');
        return Promise.resolve(false);
      }
      return run('The passkey could not be registered.', async () => {
        const registrationOptions = await client.auth.getPasskeyRegistrationOptions(appId, friendlyName);
        const credential = await createCredential(registrationOptions);
        await client.auth.completePasskeyRegistration(appId, credential);
        await reload();
        const name = friendlyName?.trim();
        return `Passkey "${name || 'new passkey'}" added.`;
      });
    },
    [appId, client, createCredential, reload, run],
  );

  const rename = useCallback(
    (passkeyId: string, friendlyName: string) => {
      if (!friendlyName.trim()) return Promise.resolve(false);
      return run('The passkey could not be renamed.', async () => {
        await client.auth.renamePasskey(passkeyId, friendlyName);
        await reload();
        return 'Passkey renamed.';
      });
    },
    [client, reload, run],
  );

  const remove = useCallback(
    (passkey: UserPasskey) =>
      run('The passkey could not be removed.', async () => {
        await client.auth.deletePasskey(passkey.id);
        await reload();
        return `Passkey "${passkeyDisplayName(passkey)}" removed.`;
      }),
    [client, reload, run],
  );

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccessMessage(null);
  }, []);

  return {
    loaded,
    appEnabled,
    canRegister: !!createCredential,
    passkeys,
    loading,
    error,
    successMessage,
    refresh,
    register,
    rename,
    remove,
    clearMessages,
  };
}
