'use client';

import { useState, useCallback } from 'react';
import type { SubscriptionPlan, Subscription, SubscriptionResult } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseSubscriptionReturn {
  plans: SubscriptionPlan[];
  subscriptions: Subscription[];
  loading: boolean;
  error: string | null;
  getPlans: () => Promise<SubscriptionPlan[]>;
  getUserSubscriptions: () => Promise<Subscription[]>;
  getSubscription: (subscriptionId: string) => Promise<Subscription | null>;
  subscribe: (planId: string, paymentMethodId?: string) => Promise<SubscriptionResult>;
  cancelSubscription: (subscriptionId: string) => Promise<SubscriptionResult>;
  changePlan: (subscriptionId: string, newPlanId: string) => Promise<SubscriptionResult>;
  pauseSubscription: (subscriptionId: string) => Promise<SubscriptionResult>;
  resumeSubscription: (subscriptionId: string) => Promise<SubscriptionResult>;
}

export function useSubscription(): UseSubscriptionReturn {
  const client = useWildwood();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appId = client.config.appId ?? '';

  const getPlans = useCallback(async () => {
    const result = await client.subscription.getPlans(appId);
    setPlans(result);
    return result;
  }, [client, appId]);

  const getUserSubscriptions = useCallback(async () => {
    const result = await client.subscription.getUserSubscriptions();
    setSubscriptions(result);
    return result;
  }, [client]);

  const getSubscription = useCallback(
    async (subscriptionId: string) => {
      return client.subscription.getSubscription(subscriptionId);
    },
    [client],
  );

  const subscribe = useCallback(
    async (planId: string, paymentMethodId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await client.subscription.subscribe(planId, paymentMethodId);
        await getUserSubscriptions();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Subscription failed');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client, getUserSubscriptions],
  );

  const cancelSubscription = useCallback(
    async (subscriptionId: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await client.subscription.cancelSubscription(subscriptionId);
        await getUserSubscriptions();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Cancel subscription failed');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client, getUserSubscriptions],
  );

  const changePlan = useCallback(
    async (subscriptionId: string, newPlanId: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await client.subscription.changePlan(subscriptionId, newPlanId);
        await getUserSubscriptions();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Change plan failed');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client, getUserSubscriptions],
  );

  const pauseSubscription = useCallback(
    async (subscriptionId: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await client.subscription.pauseSubscription(subscriptionId);
        await getUserSubscriptions();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Pause subscription failed');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client, getUserSubscriptions],
  );

  const resumeSubscription = useCallback(
    async (subscriptionId: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await client.subscription.resumeSubscription(subscriptionId);
        await getUserSubscriptions();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Resume subscription failed');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client, getUserSubscriptions],
  );

  return {
    plans,
    subscriptions,
    loading,
    error,
    getPlans,
    getUserSubscriptions,
    getSubscription,
    subscribe,
    cancelSubscription,
    changePlan,
    pauseSubscription,
    resumeSubscription,
  };
}
