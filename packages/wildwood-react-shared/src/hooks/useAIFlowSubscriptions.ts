'use client';

// AI flow subscription state for web + native UIs: a user's standing orders for
// scheduled runs of published flows — list, create, update, enable/disable,
// delete, and sync the latest scheduled run's result. A create that hits the
// plan limit (429) surfaces the server's upgrade copy via `limitMessage`.

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  AIFlowRunDetail,
  AIFlowSubscription,
  AIFlowSubscriptionCreateRequest,
  AIFlowSubscriptionUpdateRequest,
} from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseAIFlowSubscriptionsOptions {
  /** Override the API base INCLUDING the /api segment. Defaults to the client config. */
  apiBaseUrl?: string;
  /** Override the app whose subscriptions are targeted. Defaults to the client config appId. */
  appId?: string;
}

export interface UseAIFlowSubscriptionsReturn {
  subscriptions: AIFlowSubscription[];
  loading: boolean;
  error: string | null;
  /** Server's upgrade copy after a create hit the plan limit (429); null otherwise. */
  limitMessage: string | null;
  refresh: () => Promise<void>;
  /** Creates a standing order; returns it, or null on failure (check limitMessage for a plan-limit hit). */
  create: (request: AIFlowSubscriptionCreateRequest) => Promise<AIFlowSubscription | null>;
  update: (subscriptionId: string, request: AIFlowSubscriptionUpdateRequest) => Promise<AIFlowSubscription | null>;
  setEnabled: (subscriptionId: string, enabled: boolean) => Promise<AIFlowSubscription | null>;
  remove: (subscriptionId: string) => Promise<boolean>;
  /** Full detail of the subscription's latest scheduled run (null when none yet). */
  getLatestRun: (subscriptionId: string) => Promise<AIFlowRunDetail | null>;
}

export function useAIFlowSubscriptions(options?: UseAIFlowSubscriptionsOptions): UseAIFlowSubscriptionsReturn {
  const client = useWildwood();
  const { apiBaseUrl, appId } = options ?? {};

  const [subscriptions, setSubscriptions] = useState<AIFlowSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const disposedRef = useRef(false);

  const requestOptions = useCallback(() => ({ apiBaseUrl, appId }), [apiBaseUrl, appId]);

  const refresh = useCallback(async () => {
    const list = await client.aiFlowSubscription.getSubscriptions(requestOptions());
    if (!disposedRef.current) {
      setSubscriptions(list);
      setLoading(false);
    }
  }, [client, requestOptions]);

  useEffect(() => {
    disposedRef.current = false;
    setLoading(true);
    void refresh();
    return () => {
      disposedRef.current = true;
    };
  }, [refresh]);

  const create = useCallback(
    async (request: AIFlowSubscriptionCreateRequest): Promise<AIFlowSubscription | null> => {
      setError(null);
      setLimitMessage(null);
      const created = await client.aiFlowSubscription.create(request, requestOptions());
      const limit = client.aiFlowSubscription.lastLimitMessage;
      if (!disposedRef.current) {
        setLimitMessage(limit);
        // A 429 is surfaced via limitMessage, not error; only flag a generic failure otherwise.
        if (!created && !limit) setError('Unable to create the subscription. Please try again.');
      }
      if (created) await refresh();
      return created;
    },
    [client, requestOptions, refresh],
  );

  const update = useCallback(
    async (subscriptionId: string, request: AIFlowSubscriptionUpdateRequest): Promise<AIFlowSubscription | null> => {
      setError(null);
      const updated = await client.aiFlowSubscription.update(subscriptionId, request, requestOptions());
      if (updated) await refresh();
      else if (!disposedRef.current) setError('Unable to update the subscription. Please try again.');
      return updated;
    },
    [client, requestOptions, refresh],
  );

  const setEnabled = useCallback(
    async (subscriptionId: string, enabled: boolean): Promise<AIFlowSubscription | null> => {
      setError(null);
      const result = await client.aiFlowSubscription.setEnabled(subscriptionId, enabled, requestOptions());
      if (result) await refresh();
      else if (!disposedRef.current) setError('Unable to update the subscription. Please try again.');
      return result;
    },
    [client, requestOptions, refresh],
  );

  const remove = useCallback(
    async (subscriptionId: string): Promise<boolean> => {
      setError(null);
      const deleted = await client.aiFlowSubscription.delete(subscriptionId, requestOptions());
      if (deleted) await refresh();
      else if (!disposedRef.current) setError('Unable to delete the subscription. Please try again.');
      return deleted;
    },
    [client, requestOptions, refresh],
  );

  const getLatestRun = useCallback(
    (subscriptionId: string) => client.aiFlowSubscription.getLatestRun(subscriptionId, requestOptions()),
    [client, requestOptions],
  );

  return { subscriptions, loading, error, limitMessage, refresh, create, update, setEnabled, remove, getLatestRun };
}
