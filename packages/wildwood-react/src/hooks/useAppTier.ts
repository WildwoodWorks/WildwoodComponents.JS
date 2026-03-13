import { useState, useCallback, useRef } from 'react';
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
  selfSubscribe: (appTierId: string, appTierPricingId?: string) => Promise<AppTierChangeResultModel>;
}

export function useAppTier(): UseAppTierReturn {
  const client = useWildwood();
  const clientRef = useRef(client);
  clientRef.current = client;

  const [tiers, setTiers] = useState<AppTierModel[]>([]);
  const [userSubscription, setUserSubscription] = useState<UserTierSubscriptionModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appId = client.config.appId ?? '';

  const getTiers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await clientRef.current.appTier.getTiers(appId);
      setTiers(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tiers');
      return [];
    } finally {
      setLoading(false);
    }
  }, [appId]);

  const getTier = useCallback(async (tierId: string) => {
    return clientRef.current.appTier.getTier(tierId);
  }, []);

  const getUserSubscription = useCallback(async () => {
    const result = await clientRef.current.appTier.getUserSubscription(appId);
    setUserSubscription(result);
    return result;
  }, [appId]);

  const checkFeature = useCallback(
    async (featureKey: string) => {
      return clientRef.current.appTier.checkFeature(featureKey, appId);
    },
    [appId],
  );

  const getLimitStatus = useCallback(
    async (limitKey: string) => {
      return clientRef.current.appTier.getLimitStatus(limitKey, appId);
    },
    [appId],
  );

  const changeTier = useCallback(
    async (tierId: string, pricingModelId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await clientRef.current.appTier.changeTier(tierId, pricingModelId);
        const sub = await clientRef.current.appTier.getUserSubscription(appId);
        setUserSubscription(sub);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Tier change failed');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [appId],
  );

  const selfSubscribe = useCallback(
    async (appTierId: string, appTierPricingId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await clientRef.current.appTier.selfSubscribe(appId, appTierId, appTierPricingId);
        const sub = await clientRef.current.appTier.getUserSubscription(appId);
        setUserSubscription(sub);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Subscription failed');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [appId],
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
    selfSubscribe,
  };
}
