import { useState, useCallback } from 'react';
import type {
  PendingDisclaimersResponse,
  DisclaimerAcceptanceResult,
  DisclaimerAcceptanceResponse,
} from '@wildwood/core';
import { useWildwood } from './useWildwood';

export interface UseDisclaimerReturn {
  disclaimers: PendingDisclaimersResponse | null;
  loading: boolean;
  error: string | null;
  getPendingDisclaimers: () => Promise<PendingDisclaimersResponse>;
  acceptDisclaimer: (disclaimerId: string, versionId: string) => Promise<DisclaimerAcceptanceResult>;
  acceptAllDisclaimers: (acceptances: Array<{ disclaimerId: string; versionId: string }>) => Promise<DisclaimerAcceptanceResponse>;
}

export function useDisclaimer(): UseDisclaimerReturn {
  const client = useWildwood();
  const [disclaimers, setDisclaimers] = useState<PendingDisclaimersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appId = client.config.appId ?? '';

  const getPendingDisclaimers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.disclaimer.getPendingDisclaimers(appId);
      setDisclaimers(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load disclaimers');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client, appId]);

  const acceptDisclaimer = useCallback(async (disclaimerId: string, versionId: string) => {
    setError(null);
    try {
      const result = await client.disclaimer.acceptDisclaimer(disclaimerId, versionId);
      await getPendingDisclaimers();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept disclaimer');
      throw err;
    }
  }, [client, getPendingDisclaimers]);

  const acceptAllDisclaimers = useCallback(async (
    acceptances: Array<{ disclaimerId: string; versionId: string }>,
  ) => {
    setError(null);
    try {
      const result = await client.disclaimer.acceptAllDisclaimers(acceptances);
      setDisclaimers(null);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept disclaimers');
      throw err;
    }
  }, [client]);

  return { disclaimers, loading, error, getPendingDisclaimers, acceptDisclaimer, acceptAllDisclaimers };
}
