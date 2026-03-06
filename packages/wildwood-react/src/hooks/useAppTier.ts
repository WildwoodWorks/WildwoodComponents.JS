'use client';

import { useState, useCallback } from 'react';
import type {
  AppTierModel,
  UserTierSubscriptionModel,
  AppFeatureCheckResultModel,
  AppTierLimitStatusModel,
  AppTierChangeResultModel,
} from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseAppTierReturn {
  tiers: AppTierModel[];
  userSubscription: UserTierSubscriptionModel | null;
  loading: boolean;
  error: string | null;
  getTiers: () => Promise<AppTierModel[]>;
  getTier: (tierId: string) => Promise<AppTierModel | null>;
  getUserSubscription: () => Promise<UserTierSubscriptionModel | null>;
  checkFeature: (featureKey: string) => Promise<AppFeatureCheckResultModel>;
  getLimitStatus: (limitKey: string) => Promise<AppTierLimitStatusModel>;
  changeTier: (tierId: string, pricingModelId?: string) => Promise<AppTierChangeResultModel>;
}

export function useAppTier(): UseAppTierReturn {
  const client = useWildwood();
  const [tiers, setTiers] = useState<AppTierModel[]>([]);
  const [userSubscription, setUserSubscription] = useState<UserTierSubscriptionModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appId = client.config.appId ?? '';

  const getTiers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.appTier.getTiers(appId);
      setTiers(result);
      return result;
    } finally {
      setLoading(false);
    }
  }, [client, appId]);

  const getTier = useCallback(
    async (tierId: string) => {
      return client.appTier.getTier(tierId);
    },
    [client],
  );

  const getUserSubscription = useCallback(async () => {
    const result = await client.appTier.getUserSubscription();
    setUserSubscription(result);
    return result;
  }, [client]);

  const checkFeature = useCallback(
    async (featureKey: string) => {
      return client.appTier.checkFeature(featureKey);
    },
    [client],
  );

  const getLimitStatus = useCallback(
    async (limitKey: string) => {
      return client.appTier.getLimitStatus(limitKey);
    },
    [client],
  );

  const changeTier = useCallback(
    async (tierId: string, pricingModelId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await client.appTier.changeTier(tierId, pricingModelId);
        await getUserSubscription();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Tier change failed');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client, getUserSubscription],
  );

  return {
    tiers,
    userSubscription,
    loading,
    error,
    getTiers,
    getTier,
    getUserSubscription,
    checkFeature,
    getLimitStatus,
    changeTier,
  };
}
