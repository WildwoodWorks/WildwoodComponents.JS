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
  // Mirrors the subscription state so refresh() can degrade to the previous value
  // without taking the state as a dependency.
  const subscriptionRef = useRef<UserTierSubscriptionModel | null>(null);

  const appId = client.config.appId ?? '';

  const refresh = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    setError(null);
    try {
      // Failure policy: the two fetches settle independently so one failing doesn't
      // discard the other's data. Limit statuses are the dashboard's primary data — a
      // failed fetch surfaces as the hook error. The subscription is an enrichment: when
      // its lookup fails, keep the previously loaded value (degrade) instead of erroring
      // the whole dashboard.
      const [statusesResult, subResult] = await Promise.allSettled([
        clientRef.current.appTier.getAllLimitStatuses(appId),
        clientRef.current.appTier.getUserSubscription(appId),
      ]);

      if (subResult.status === 'fulfilled') {
        subscriptionRef.current = subResult.value;
        setSubscription(subResult.value);
      }

      if (statusesResult.status === 'rejected') {
        const reason: unknown = statusesResult.reason;
        setError(reason instanceof Error ? reason.message : 'Failed to load usage data');
        return;
      }

      const statuses = statusesResult.value;
      setRawLimitStatuses(statuses);

      if (onMergeUsageRef.current) {
        const merged = await onMergeUsageRef.current(statuses, subscriptionRef.current);
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
