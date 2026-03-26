'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppTierLimitStatusModel, UserTierSubscriptionModel } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseUsageDashboardOptions {
  /** Auto-refresh interval in milliseconds. Default: no auto-refresh. */
  refreshInterval?: number;
  /**
   * Optional callback to merge or transform limit statuses after fetching from the API.
   * Called during each refresh() cycle (on mount and on interval).
   * Use this when the merge function itself fetches the data it needs.
   * For merging with externally-managed state, prefer calling a merge function
   * directly in your render using rawLimitStatuses instead.
   */
  onMergeUsage?: (
    statuses: AppTierLimitStatusModel[],
    subscription: UserTierSubscriptionModel | null,
  ) => AppTierLimitStatusModel[] | Promise<AppTierLimitStatusModel[]>;
}

export interface UseUsageDashboardReturn {
  /** Limit statuses (after onMergeUsage if provided, otherwise raw API data). */
  limitStatuses: AppTierLimitStatusModel[];
  /** Raw limit statuses from the API before any merge transform. */
  rawLimitStatuses: AppTierLimitStatusModel[];
  subscription: UserTierSubscriptionModel | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useUsageDashboard(options?: UseUsageDashboardOptions): UseUsageDashboardReturn {
  const client = useWildwood();
  const clientRef = useRef(client);
  clientRef.current = client;

  const [rawLimitStatuses, setRawLimitStatuses] = useState<AppTierLimitStatusModel[]>([]);
  const [mergedLimitStatuses, setMergedLimitStatuses] = useState<AppTierLimitStatusModel[]>([]);
  const [subscription, setSubscription] = useState<UserTierSubscriptionModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onMergeUsageRef = useRef(options?.onMergeUsage);
  onMergeUsageRef.current = options?.onMergeUsage;

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
      setRawLimitStatuses(statuses);
      setSubscription(sub);

      if (onMergeUsageRef.current) {
        const merged = await onMergeUsageRef.current(statuses, sub);
        setMergedLimitStatuses(merged);
      } else {
        setMergedLimitStatuses(statuses);
      }
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

  return { limitStatuses: mergedLimitStatuses, rawLimitStatuses, subscription, loading, error, refresh };
}
