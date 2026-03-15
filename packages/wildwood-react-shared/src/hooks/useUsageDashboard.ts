'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppTierLimitStatusModel, UserTierSubscriptionModel } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseUsageDashboardOptions {
  /** Auto-refresh interval in milliseconds. Default: no auto-refresh. */
  refreshInterval?: number;
}

export interface UseUsageDashboardReturn {
  limitStatuses: AppTierLimitStatusModel[];
  subscription: UserTierSubscriptionModel | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useUsageDashboard(options?: UseUsageDashboardOptions): UseUsageDashboardReturn {
  const client = useWildwood();
  const clientRef = useRef(client);
  clientRef.current = client;

  const [limitStatuses, setLimitStatuses] = useState<AppTierLimitStatusModel[]>([]);
  const [subscription, setSubscription] = useState<UserTierSubscriptionModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appId = client.config.appId ?? '';

  const refresh = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    setError(null);
    try {
      const [statuses, sub] = await Promise.all([
        clientRef.current.appTier.getAllLimitStatuses(appId),
        clientRef.current.appTier.getUserSubscription(appId),
      ]);
      setLimitStatuses(statuses);
      setSubscription(sub);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage data');
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (options?.refreshInterval && options.refreshInterval > 0) {
      intervalRef.current = setInterval(() => {
        refresh();
      }, options.refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [options?.refreshInterval, refresh]);

  return { limitStatuses, subscription, loading, error, refresh };
}
