'use client';

import { useState, useCallback } from 'react';
import type { PublicConsentConfig, ConsentState, ConsentInitResult, ConsentCategory } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseConsentReturn {
  config: PublicConsentConfig | null;
  state: ConsentState | null;
  loading: boolean;
  error: string | null;
  /** Whether the banner should be shown to this visitor. */
  shouldShowBanner: boolean;
  /** Fetch config, apply the decision table, and inject already-consented scripts. */
  initialize: () => Promise<ConsentInitResult>;
  acceptAll: () => Promise<void>;
  rejectAll: () => Promise<void>;
  setCategories: (selection: Partial<Record<ConsentCategory, boolean>>) => Promise<void>;
  withdraw: () => Promise<void>;
  /** Check whether a category is currently granted. */
  isGranted: (category: ConsentCategory) => boolean;
}

/**
 * Consent hook. Wraps the core ConsentService so app code can gate first-party features and render
 * the banner/preferences UI. Block-before-consent and script injection happen in the core engine.
 */
export function useConsent(): UseConsentReturn {
  const client = useWildwood();
  const [config, setConfig] = useState<PublicConsentConfig | null>(null);
  const [state, setState] = useState<ConsentState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shouldShowBanner, setShouldShowBanner] = useState(false);

  const initialize = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.consent.initialize();
      setConfig(result.config);
      setState(result.state);
      setShouldShowBanner(result.shouldShowBanner);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize consent');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  const acceptAll = useCallback(async () => {
    await client.consent.acceptAll();
    setState(client.consent.getState());
    setShouldShowBanner(false);
  }, [client]);

  const rejectAll = useCallback(async () => {
    await client.consent.rejectAll();
    setState(client.consent.getState());
    setShouldShowBanner(false);
  }, [client]);

  const setCategories = useCallback(
    async (selection: Partial<Record<ConsentCategory, boolean>>) => {
      await client.consent.setCategories(selection);
      setState(client.consent.getState());
      setShouldShowBanner(false);
    },
    [client],
  );

  const withdraw = useCallback(async () => {
    await client.consent.withdraw();
    setState(client.consent.getState());
  }, [client]);

  const isGranted = useCallback((category: ConsentCategory) => client.consent.isGranted(category), [client]);

  return {
    config,
    state,
    loading,
    error,
    shouldShowBanner,
    initialize,
    acceptAll,
    rejectAll,
    setCategories,
    withdraw,
    isGranted,
  };
}
