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
  getPendingDisclaimers: () => Promise<PendingDisclaimersResponse>;
  acceptDisclaimer: (disclaimerId: string, versionId: string) => Promise<DisclaimerAcceptanceResult>;
  acceptAllDisclaimers: (acceptances: Array<{ disclaimerId: string; versionId: string }>) => Promise<DisclaimerAcceptanceResponse>;
}

export function useDisclaimer(): UseDisclaimerReturn {
  const client = useWildwood();
  const [disclaimers, setDisclaimers] = useState<PendingDisclaimersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const appId = client.config.appId ?? '';

  const getPendingDisclaimers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.disclaimer.getPendingDisclaimers(appId);
      setDisclaimers(result);
      return result;
    } finally {
      setLoading(false);
    }
  }, [client, appId]);

  const acceptDisclaimer = useCallback(async (disclaimerId: string, versionId: string) => {
    const result = await client.disclaimer.acceptDisclaimer(disclaimerId, versionId);
    await getPendingDisclaimers();
    return result;
  }, [client, getPendingDisclaimers]);

  const acceptAllDisclaimers = useCallback(async (
    acceptances: Array<{ disclaimerId: string; versionId: string }>,
  ) => {
    const result = await client.disclaimer.acceptAllDisclaimers(acceptances);
    setDisclaimers(null);
    return result;
  }, [client]);

  return { disclaimers, loading, getPendingDisclaimers, acceptDisclaimer, acceptAllDisclaimers };
}
