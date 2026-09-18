'use client';

// The app's live registration settings, resolved into the paths a signup screen may offer.
//
// Deliberately NOT cached across mounts, unlike useFeatures/usePublicCatalog: an operator who has
// just turned open registration off in WildwoodAdmin expects the next visitor to see the closed
// screen, not a screen a module cache kept alive. One small unauthenticated GET per mount is a fair
// price for that.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthenticationConfiguration } from '@wildwood/core';
import {
  resolveSignupRegistrationMode,
  type SignupRegistrationMode,
  type SignupTokenMode,
} from '../authentication/registrationMode.js';
import { useWildwood } from './useWildwood.js';

export interface UseRegistrationModeOptions {
  /** `'required'` is invite redemption: the token path is offered whatever the settings say. */
  tokenMode?: SignupTokenMode;
  /** Set false to hold the request back (the screen is not shown yet). Defaults to true. */
  enabled?: boolean;
}

export interface UseRegistrationModeReturn {
  /**
   * How registration may be offered. While the settings are loading, and when they cannot be read,
   * this is the open-sign-up fallback with `source: 'fallback'` — pair it with `loading` so a view
   * can wait rather than flashing a path the server may refuse.
   */
  mode: SignupRegistrationMode;
  /** The raw configuration, or `null` when the app has none or it could not be read. */
  config: AuthenticationConfiguration | null;
  loading: boolean;
  error: string | null;
  /** Re-read the settings. */
  reload: () => Promise<void>;
}

/**
 * Read the app's authentication configuration and resolve the signup registration mode.
 *
 * @param appId Defaults to the client's configured app.
 */
export function useRegistrationMode(
  appId?: string,
  options: UseRegistrationModeOptions = {},
): UseRegistrationModeReturn {
  const client = useWildwood();
  const resolvedAppId = appId ?? client.config.appId ?? '';
  const { tokenMode = 'auto', enabled = true } = options;

  const [config, setConfig] = useState<AuthenticationConfiguration | null>(null);
  const [loading, setLoading] = useState(enabled && Boolean(resolvedAppId));
  const [error, setError] = useState<string | null>(null);

  // Every request gets a sequence number; only the newest one is allowed to write state, so a
  // response that lands after an unmount or an appId change is dropped.
  const sequence = useRef(0);

  const load = useCallback(async () => {
    if (!enabled || !resolvedAppId) {
      setLoading(false);
      return;
    }
    const mine = (sequence.current += 1);
    setLoading(true);
    try {
      const next = await client.auth.getAuthenticationConfiguration(resolvedAppId);
      if (mine !== sequence.current) return;
      setConfig(next ?? null);
      setError(null);
    } catch (err) {
      if (mine !== sequence.current) return;
      setConfig(null);
      setError(err instanceof Error ? err.message : 'Failed to read the registration settings');
    } finally {
      if (mine === sequence.current) setLoading(false);
    }
  }, [client, resolvedAppId, enabled]);

  useEffect(() => {
    void load();
    return () => {
      // Retire whatever is in flight: its answer is about the previous appId, or nobody.
      sequence.current += 1;
    };
  }, [load]);

  const mode = useMemo(() => resolveSignupRegistrationMode(config, { tokenMode }), [config, tokenMode]);

  return { mode, config, loading, error, reload: load };
}
