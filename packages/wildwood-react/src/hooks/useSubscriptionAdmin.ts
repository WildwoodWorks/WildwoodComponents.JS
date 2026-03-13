// Hook for admin subscription management - ported from WildwoodComponents.Blazor admin panels

import { useState, useCallback, useRef } from 'react';
import type {
  AppTierModel,
  AppTierAddOnModel,
  UserTierSubscriptionModel,
  UserAddOnSubscriptionModel,
  AppTierLimitStatusModel,
  AppTierChangeResultModel,
  AppFeatureDefinitionModel,
} from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseSubscriptionAdminReturn {
  // Data
  tiers: AppTierModel[];
  addOns: AppTierAddOnModel[];
  subscription: UserTierSubscriptionModel | null;
  addOnSubscriptions: UserAddOnSubscriptionModel[];
  limitStatuses: AppTierLimitStatusModel[];
  featureDefinitions: AppFeatureDefinitionModel[];
  featureStatus: Record<string, boolean>;

  // State
  loading: boolean;
  error: string | null;

  // Tier browsing
  getTiers: (appId: string) => Promise<AppTierModel[]>;
  getAvailableAddOns: (appId: string) => Promise<AppTierAddOnModel[]>;
  getAllAddOns: (appId: string) => Promise<AppTierAddOnModel[]>;

  // User-scoped
  getMySubscription: (appId: string) => Promise<UserTierSubscriptionModel | null>;
  getMyAddOns: (appId: string) => Promise<UserAddOnSubscriptionModel[]>;

  // Company-scoped (admin)
  getCompanySubscription: (appId: string, companyId: string) => Promise<UserTierSubscriptionModel | null>;
  getCompanyAddOnSubscriptions: (appId: string, companyId: string) => Promise<UserAddOnSubscriptionModel[]>;
  getCompanyLimitStatuses: (appId: string, companyId: string) => Promise<AppTierLimitStatusModel[]>;
  getCompanyFeatures: (appId: string, companyId: string) => Promise<Record<string, boolean>>;

  // Feature definitions
  getFeatureDefinitions: (appId: string) => Promise<AppFeatureDefinitionModel[]>;
  getUserFeatures: (appId: string) => Promise<Record<string, boolean>>;

  // Limit statuses
  getLimitStatuses: (appId: string) => Promise<AppTierLimitStatusModel[]>;

  // Actions
  subscribeTo: (appId: string, tierId: string, pricingId?: string) => Promise<AppTierChangeResultModel>;
  changeTier: (
    appId: string,
    tierId: string,
    pricingId?: string,
    immediate?: boolean,
  ) => Promise<AppTierChangeResultModel>;
  cancelSubscription: (appId: string) => Promise<boolean>;
  subscribeToAddOn: (appId: string, addOnId: string, pricingId?: string) => Promise<boolean>;
  cancelAddOn: (subscriptionId: string) => Promise<boolean>;

  // Company-scoped actions
  subscribeCompanyToTier: (
    appId: string,
    companyId: string,
    tierId: string,
    pricingId?: string,
  ) => Promise<AppTierChangeResultModel>;
  changeCompanyTier: (
    appId: string,
    companyId: string,
    tierId: string,
    pricingId?: string,
    immediate?: boolean,
  ) => Promise<AppTierChangeResultModel>;
  cancelCompanySubscription: (appId: string, companyId: string) => Promise<boolean>;
  subscribeCompanyToAddOn: (appId: string, companyId: string, addOnId: string) => Promise<boolean>;
  cancelCompanyAddOn: (subscriptionId: string, immediate?: boolean) => Promise<boolean>;

  // Refresh all data for a given context
  refreshAll: (appId: string, companyId?: string) => Promise<void>;
}

export function useSubscriptionAdmin(): UseSubscriptionAdminReturn {
  const client = useWildwood();
  const clientRef = useRef(client);
  clientRef.current = client;

  const [tiers, setTiers] = useState<AppTierModel[]>([]);
  const [addOns, setAddOns] = useState<AppTierAddOnModel[]>([]);
  const [subscription, setSubscription] = useState<UserTierSubscriptionModel | null>(null);
  const [addOnSubscriptions, setAddOnSubscriptions] = useState<UserAddOnSubscriptionModel[]>([]);
  const [limitStatuses, setLimitStatuses] = useState<AppTierLimitStatusModel[]>([]);
  const [featureDefinitions, setFeatureDefinitions] = useState<AppFeatureDefinitionModel[]>([]);
  const [featureStatus, setFeatureStatus] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wrap = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Tier browsing
  const getTiers = useCallback(async (appId: string) => {
    const result = await clientRef.current.appTier.getTiers(appId);
    setTiers(result);
    return result;
  }, []);

  const getAvailableAddOns = useCallback(async (appId: string) => {
    const result = await clientRef.current.appTier.getAvailableAddOns(appId);
    setAddOns(result);
    return result;
  }, []);

  const getAllAddOns = useCallback(async (appId: string) => {
    const result = await clientRef.current.appTier.getAllAddOns(appId);
    setAddOns(result);
    return result;
  }, []);

  // User-scoped
  const getMySubscription = useCallback(async (appId: string) => {
    const result = await clientRef.current.appTier.getUserSubscription(appId);
    setSubscription(result);
    return result;
  }, []);

  const getMyAddOns = useCallback(async (appId: string) => {
    const result = await clientRef.current.appTier.getUserAddOns(appId);
    setAddOnSubscriptions(result);
    return result;
  }, []);

  // Company-scoped
  const getCompanySubscription = useCallback(async (appId: string, companyId: string) => {
    const result = await clientRef.current.appTier.getCompanySubscription(appId, companyId);
    setSubscription(result);
    return result;
  }, []);

  const getCompanyAddOnSubscriptions = useCallback(async (appId: string, companyId: string) => {
    const result = await clientRef.current.appTier.getCompanyAddOnSubscriptions(appId, companyId);
    setAddOnSubscriptions(result);
    return result;
  }, []);

  const getCompanyLimitStatuses = useCallback(async (appId: string, companyId: string) => {
    const result = await clientRef.current.appTier.getCompanyLimitStatuses(appId, companyId);
    setLimitStatuses(result);
    return result;
  }, []);

  const getCompanyFeatures = useCallback(async (appId: string, companyId: string) => {
    const result = await clientRef.current.appTier.getCompanyFeatures(appId, companyId);
    setFeatureStatus(result);
    return result;
  }, []);

  // Feature definitions
  const getFeatureDefinitions = useCallback(async (appId: string) => {
    const result = await clientRef.current.appTier.getFeatureDefinitions(appId);
    setFeatureDefinitions(result);
    return result;
  }, []);

  const getUserFeatures = useCallback(async (appId: string) => {
    const result = await clientRef.current.appTier.getUserFeatures(appId);
    setFeatureStatus(result);
    return result;
  }, []);

  // Limit statuses
  const getLimitStatuses = useCallback(async (appId: string) => {
    const result = await clientRef.current.appTier.getAllLimitStatuses(appId);
    setLimitStatuses(result);
    return result;
  }, []);

  // Actions
  const subscribeTo = useCallback(
    async (appId: string, tierId: string, pricingId?: string) => {
      return wrap(() => clientRef.current.appTier.subscribeTo(appId, tierId, pricingId));
    },
    [wrap],
  );

  const changeTier = useCallback(
    async (appId: string, tierId: string, pricingId?: string, immediate?: boolean) => {
      return wrap(() => clientRef.current.appTier.changeTierAdvanced(appId, tierId, pricingId, immediate));
    },
    [wrap],
  );

  const cancelSubscription = useCallback(
    async (appId: string) => {
      return wrap(() => clientRef.current.appTier.cancelSubscription(appId));
    },
    [wrap],
  );

  const subscribeToAddOn = useCallback(
    async (appId: string, addOnId: string, pricingId?: string) => {
      return wrap(() => clientRef.current.appTier.subscribeToAddOn(appId, addOnId, pricingId));
    },
    [wrap],
  );

  const cancelAddOn = useCallback(
    async (subscriptionId: string) => {
      return wrap(() => clientRef.current.appTier.cancelAddOnSubscription(subscriptionId));
    },
    [wrap],
  );

  // Company-scoped actions
  const subscribeCompanyToTier = useCallback(
    async (appId: string, companyId: string, tierId: string, pricingId?: string) => {
      return wrap(() => clientRef.current.appTier.subscribeCompanyToTier(appId, companyId, tierId, pricingId));
    },
    [wrap],
  );

  const changeCompanyTier = useCallback(
    async (appId: string, companyId: string, tierId: string, pricingId?: string, immediate?: boolean) => {
      return wrap(() => clientRef.current.appTier.changeCompanyTier(appId, companyId, tierId, pricingId, immediate));
    },
    [wrap],
  );

  const cancelCompanySubscription = useCallback(
    async (appId: string, companyId: string) => {
      return wrap(() => clientRef.current.appTier.cancelCompanySubscription(appId, companyId));
    },
    [wrap],
  );

  const subscribeCompanyToAddOn = useCallback(
    async (appId: string, companyId: string, addOnId: string) => {
      return wrap(() => clientRef.current.appTier.subscribeCompanyToAddOn(appId, companyId, addOnId));
    },
    [wrap],
  );

  const cancelCompanyAddOn = useCallback(
    async (subscriptionId: string, immediate?: boolean) => {
      return wrap(() => clientRef.current.appTier.cancelCompanyAddOn(subscriptionId, immediate));
    },
    [wrap],
  );

  // Refresh all data
  const refreshAll = useCallback(
    async (appId: string, companyId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const promises: Promise<unknown>[] = [getTiers(appId)];

        if (companyId) {
          promises.push(
            getCompanySubscription(appId, companyId),
            getCompanyAddOnSubscriptions(appId, companyId),
            getCompanyLimitStatuses(appId, companyId),
            getFeatureDefinitions(appId),
            getCompanyFeatures(appId, companyId),
            getAllAddOns(appId),
          );
        } else {
          promises.push(
            getMySubscription(appId),
            getMyAddOns(appId),
            getLimitStatuses(appId),
            getFeatureDefinitions(appId),
            getUserFeatures(appId),
            getAvailableAddOns(appId),
          );
        }

        await Promise.all(promises);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load subscription data');
      } finally {
        setLoading(false);
      }
    },
    [
      getTiers,
      getMySubscription,
      getMyAddOns,
      getLimitStatuses,
      getFeatureDefinitions,
      getUserFeatures,
      getAvailableAddOns,
      getCompanySubscription,
      getCompanyAddOnSubscriptions,
      getCompanyLimitStatuses,
      getCompanyFeatures,
      getAllAddOns,
    ],
  );

  return {
    tiers,
    addOns,
    subscription,
    addOnSubscriptions,
    limitStatuses,
    featureDefinitions,
    featureStatus,
    loading,
    error,
    getTiers,
    getAvailableAddOns,
    getAllAddOns,
    getMySubscription,
    getMyAddOns,
    getCompanySubscription,
    getCompanyAddOnSubscriptions,
    getCompanyLimitStatuses,
    getCompanyFeatures,
    getFeatureDefinitions,
    getUserFeatures,
    getLimitStatuses,
    subscribeTo,
    changeTier,
    cancelSubscription,
    subscribeToAddOn,
    cancelAddOn,
    subscribeCompanyToTier,
    changeCompanyTier,
    cancelCompanySubscription,
    subscribeCompanyToAddOn,
    cancelCompanyAddOn,
    refreshAll,
  };
}
