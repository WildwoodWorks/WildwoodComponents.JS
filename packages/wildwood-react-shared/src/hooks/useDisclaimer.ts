'use client';

import { useState, useCallback } from 'react';
import type {
  PendingDisclaimersResponse,
  DisclaimerAcceptanceResult,
  DisclaimerAcceptanceResponse,
} from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseDisclaimerReturn {
  disclaimers: PendingDisclaimersResponse | null;
  loading: boolean;
  error: string | null;
  getPendingDisclaimers: () => Promise<PendingDisclaimersResponse>;
  acceptDisclaimer: (disclaimerId: string, versionId: string) => Promise<DisclaimerAcceptanceResult>;
  acceptAllDisclaimers: (
    acceptances: Array<{ disclaimerId: string; versionId: string }>,
  ) => Promise<DisclaimerAcceptanceResponse>;
}

export function useDisclaimer(appId?: string): UseDisclaimerReturn {
  const client = useWildwood();
  const [disclaimers, setDisclaimers] = useState<PendingDisclaimersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Honor an explicit appId (e.g. a component rendered for an app other than the provider default),
  // falling back to the provider config. Mirrors how useAuthenticationLogic threads its appId.
  const resolvedAppId = appId ?? client.config.appId ?? '';

  const getPendingDisclaimers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.disclaimer.getPendingDisclaimers(resolvedAppId);
      setDisclaimers(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load disclaimers');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client, resolvedAppId]);

  const acceptDisclaimer = useCallback(
    async (disclaimerId: string, versionId: string) => {
      setError(null);
      try {
        const result = await client.disclaimer.acceptDisclaimer(disclaimerId, versionId, resolvedAppId);
        await getPendingDisclaimers();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to accept disclaimer');
        throw err;
      }
    },
    [client, resolvedAppId, getPendingDisclaimers],
  );

  const acceptAllDisclaimers = useCallback(
    async (acceptances: Array<{ disclaimerId: string; versionId: string }>) => {
      setError(null);
      try {
        const result = await client.disclaimer.acceptAllDisclaimers(acceptances, resolvedAppId);
        setDisclaimers(null);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to accept disclaimers');
        throw err;
      }
    },
    [client, resolvedAppId],
  );

  return { disclaimers, loading, error, getPendingDisclaimers, acceptDisclaimer, acceptAllDisclaimers };
}
