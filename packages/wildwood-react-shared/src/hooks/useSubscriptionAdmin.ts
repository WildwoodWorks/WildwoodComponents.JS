'use client';

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
  AppFeatureOverrideModel,
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
  featureOverrides: AppFeatureOverrideModel[];

  // State
  loading: boolean;
  error: string | null;
  clearError: () => void;

  // Tier browsing
  getTiers: (appId: string) => Promise<AppTierModel[]>;
  getAvailableAddOns: (appId: string) => Promise<AppTierAddOnModel[]>;
  getAllAddOns: (appId: string) => Promise<AppTierAddOnModel[]>;

  // User-scoped (self)
  getMySubscription: (appId: string) => Promise<UserTierSubscriptionModel | null>;
  getMyAddOns: (appId: string) => Promise<UserAddOnSubscriptionModel[]>;

  // Company-scoped (admin)
  getCompanySubscription: (appId: string, companyId: string) => Promise<UserTierSubscriptionModel | null>;
  getCompanyAddOnSubscriptions: (appId: string, companyId: string) => Promise<UserAddOnSubscriptionModel[]>;
  getCompanyLimitStatuses: (appId: string, companyId: string) => Promise<AppTierLimitStatusModel[]>;
  getCompanyFeatures: (appId: string, companyId: string) => Promise<Record<string, boolean>>;

  // User-scoped admin queries
  getUserSubscriptionAdmin: (appId: string, userId: string) => Promise<UserTierSubscriptionModel | null>;
  getUserFeaturesAdmin: (appId: string, userId: string) => Promise<Record<string, boolean>>;
  getUserLimitStatuses: (appId: string, userId: string) => Promise<AppTierLimitStatusModel[]>;
  getUserAddOnsAdmin: (appId: string, userId: string) => Promise<UserAddOnSubscriptionModel[]>;

  // Feature definitions
  getFeatureDefinitions: (appId: string) => Promise<AppFeatureDefinitionModel[]>;
  getUserFeatures: (appId: string) => Promise<Record<string, boolean>>;

  // Limit statuses
  getLimitStatuses: (appId: string) => Promise<AppTierLimitStatusModel[]>;

  // Actions
  subscribeTo: (appId: string, tierId: string, pricingId?: string) => Promise<AppTierChangeResultModel>;
  selfSubscribeTo: (appId: string, tierId: string, pricingId?: string) => Promise<AppTierChangeResultModel>;
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

  // User-scoped admin actions
  subscribeUserToTier: (
    appId: string,
    userId: string,
    tierId: string,
    pricingId?: string,
  ) => Promise<AppTierChangeResultModel>;
  changeUserTier: (
    appId: string,
    userId: string,
    tierId: string,
    pricingId?: string,
    immediate?: boolean,
  ) => Promise<AppTierChangeResultModel>;
  cancelUserSubscription: (appId: string, userId: string) => Promise<boolean>;
  subscribeUserToAddOn: (appId: string, userId: string, addOnId: string) => Promise<boolean>;
  cancelUserAddOn: (appId: string, subscriptionId: string) => Promise<boolean>;

  // Feature overrides (admin)
  getFeatureOverrides: (appId: string, userId?: string) => Promise<AppFeatureOverrideModel[]>;
  setFeatureOverride: (
    appId: string,
    userId: string | null,
    featureCode: string,
    isEnabled: boolean,
    reason?: string,
    expiresAt?: string,
  ) => Promise<boolean>;
  removeFeatureOverride: (appId: string, featureCode: string, userId?: string) => Promise<boolean>;

  // Usage limit overrides (admin)
  updateUsageLimit: (appId: string, limitCode: string, newMaxValue: number) => Promise<boolean>;
  resetUsage: (appId: string, limitCode: string) => Promise<boolean>;
  updateUserUsageLimit: (appId: string, userId: string, limitCode: string, newMaxValue: number) => Promise<boolean>;
  resetUserUsage: (appId: string, userId: string, limitCode: string) => Promise<boolean>;
  updateCompanyUsageLimit: (
    appId: string,
    companyId: string,
    limitCode: string,
    newMaxValue: number,
  ) => Promise<boolean>;
  resetCompanyUsage: (appId: string, companyId: string, limitCode: string) => Promise<boolean>;

  // Settings
  getTrackingMode: (appId: string) => Promise<string>;

  // Refresh all data for a given context
  refreshAll: (appId: string, companyId?: string, userId?: string) => Promise<void>;
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
  const [featureOverrides, setFeatureOverrides] = useState<AppFeatureOverrideModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);

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

  // User-scoped (self)
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

  // User-scoped admin queries
  const getUserSubscriptionAdmin = useCallback(async (appId: string, userId: string) => {
    const result = await clientRef.current.appTier.getUserSubscriptionAdmin(appId, userId);
    setSubscription(result);
    return result;
  }, []);

  const getUserFeaturesAdmin = useCallback(async (appId: string, userId: string) => {
    const result = await clientRef.current.appTier.getUserFeaturesAdmin(appId, userId);
    setFeatureStatus(result);
    return result;
  }, []);

  const getUserLimitStatuses = useCallback(async (appId: string, userId: string) => {
    const result = await clientRef.current.appTier.getUserLimitStatuses(appId, userId);
    setLimitStatuses(result);
    return result;
  }, []);

  const getUserAddOnsAdmin = useCallback(async (appId: string, userId: string) => {
    const result = await clientRef.current.appTier.getUserAddOnsAdmin(appId, userId);
    setAddOnSubscriptions(result);
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

  // Feature overrides
  const getFeatureOverrides = useCallback(async (appId: string, userId?: string) => {
    const result = await clientRef.current.appTier.getFeatureOverrides(appId, userId);
    setFeatureOverrides(result);
    return result;
  }, []);

  const setFeatureOverride = useCallback(
    async (
      appId: string,
      userId: string | null,
      featureCode: string,
      isEnabled: boolean,
      reason?: string,
      expiresAt?: string,
    ) => {
      return wrap(() =>
        clientRef.current.appTier.setFeatureOverride(appId, userId, featureCode, isEnabled, reason, expiresAt),
      );
    },
    [wrap],
  );

  const removeFeatureOverride = useCallback(
    async (appId: string, featureCode: string, userId?: string) => {
      return wrap(() => clientRef.current.appTier.removeFeatureOverride(appId, featureCode, userId));
    },
    [wrap],
  );

  // Actions
  const subscribeTo = useCallback(
    async (appId: string, tierId: string, pricingId?: string) => {
      return wrap(() => clientRef.current.appTier.subscribeTo(appId, tierId, pricingId));
    },
    [wrap],
  );

  const selfSubscribeTo = useCallback(
    async (appId: string, tierId: string, pricingId?: string) => {
      return wrap(() => clientRef.current.appTier.selfSubscribe(appId, tierId, pricingId));
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

  // User-scoped admin actions
  const subscribeUserToTier = useCallback(
    async (appId: string, userId: string, tierId: string, pricingId?: string) => {
      return wrap(() => clientRef.current.appTier.subscribeUserToTier(appId, userId, tierId, pricingId));
    },
    [wrap],
  );

  const changeUserTier = useCallback(
    async (appId: string, userId: string, tierId: string, pricingId?: string, immediate?: boolean) => {
      return wrap(() => clientRef.current.appTier.changeUserTier(appId, userId, tierId, pricingId, immediate));
    },
    [wrap],
  );

  const cancelUserSubscription = useCallback(
    async (appId: string, userId: string) => {
      return wrap(() => clientRef.current.appTier.cancelUserSubscription(appId, userId));
    },
    [wrap],
  );

  const subscribeUserToAddOn = useCallback(
    async (appId: string, userId: string, addOnId: string) => {
      return wrap(() => clientRef.current.appTier.subscribeUserToAddOn(appId, userId, addOnId));
    },
    [wrap],
  );

  const cancelUserAddOn = useCallback(
    async (appId: string, subscriptionId: string) => {
      return wrap(() => clientRef.current.appTier.cancelUserAddOn(appId, subscriptionId));
    },
    [wrap],
  );

  // Usage limit overrides (admin)
  const updateUsageLimit = useCallback(
    async (appId: string, limitCode: string, newMaxValue: number) => {
      return wrap(() => clientRef.current.appTier.updateUsageLimit(appId, limitCode, newMaxValue));
    },
    [wrap],
  );

  const resetUsage = useCallback(
    async (appId: string, limitCode: string) => {
      return wrap(() => clientRef.current.appTier.resetUsage(appId, limitCode));
    },
    [wrap],
  );

  const updateUserUsageLimit = useCallback(
    async (appId: string, userId: string, limitCode: string, newMaxValue: number) => {
      return wrap(() => clientRef.current.appTier.updateUserUsageLimit(appId, userId, limitCode, newMaxValue));
    },
    [wrap],
  );

  const resetUserUsage = useCallback(
    async (appId: string, userId: string, limitCode: string) => {
      return wrap(() => clientRef.current.appTier.resetUserUsage(appId, userId, limitCode));
    },
    [wrap],
  );

  const updateCompanyUsageLimit = useCallback(
    async (appId: string, companyId: string, limitCode: string, newMaxValue: number) => {
      return wrap(() => clientRef.current.appTier.updateCompanyUsageLimit(appId, companyId, limitCode, newMaxValue));
    },
    [wrap],
  );

  const resetCompanyUsage = useCallback(
    async (appId: string, companyId: string, limitCode: string) => {
      return wrap(() => clientRef.current.appTier.resetCompanyUsage(appId, companyId, limitCode));
    },
    [wrap],
  );

  // Settings
  const getTrackingMode = useCallback(async (appId: string) => {
    return clientRef.current.appTier.getTrackingMode(appId);
  }, []);

  // Refresh all data
  const refreshAll = useCallback(
    async (appId: string, companyId?: string, userId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const promises: Promise<unknown>[] = [getTiers(appId)];

        if (userId) {
          // User-scoped admin context
          promises.push(
            getUserSubscriptionAdmin(appId, userId),
            getUserAddOnsAdmin(appId, userId),
            getUserLimitStatuses(appId, userId),
            getFeatureDefinitions(appId),
            getUserFeaturesAdmin(appId, userId),
            getAllAddOns(appId),
            getFeatureOverrides(appId, userId),
          );
        } else if (companyId) {
          // Company-scoped admin context
          promises.push(
            getCompanySubscription(appId, companyId),
            getCompanyAddOnSubscriptions(appId, companyId),
            getCompanyLimitStatuses(appId, companyId),
            getFeatureDefinitions(appId),
            getCompanyFeatures(appId, companyId),
            getAllAddOns(appId),
            getFeatureOverrides(appId),
          );
        } else {
          // Self / current user context
          promises.push(
            getMySubscription(appId),
            getMyAddOns(appId),
            getLimitStatuses(appId),
            getFeatureDefinitions(appId),
            getUserFeatures(appId),
            getAvailableAddOns(appId),
          );
        }

        const results = await Promise.allSettled(promises);
        const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (failures.length > 0) {
          const msg = failures.map((f) => (f.reason instanceof Error ? f.reason.message : String(f.reason))).join('; ');
          setError(msg);
        }
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
      getUserSubscriptionAdmin,
      getUserAddOnsAdmin,
      getUserLimitStatuses,
      getUserFeaturesAdmin,
      getFeatureOverrides,
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
    featureOverrides,
    loading,
    error,
    clearError,
    getTiers,
    getAvailableAddOns,
    getAllAddOns,
    getMySubscription,
    getMyAddOns,
    getCompanySubscription,
    getCompanyAddOnSubscriptions,
    getCompanyLimitStatuses,
    getCompanyFeatures,
    getUserSubscriptionAdmin,
    getUserFeaturesAdmin,
    getUserLimitStatuses,
    getUserAddOnsAdmin,
    getFeatureDefinitions,
    getUserFeatures,
    getLimitStatuses,
    getFeatureOverrides,
    setFeatureOverride,
    removeFeatureOverride,
    subscribeTo,
    selfSubscribeTo,
    changeTier,
    cancelSubscription,
    subscribeToAddOn,
    cancelAddOn,
    subscribeCompanyToTier,
    changeCompanyTier,
    cancelCompanySubscription,
    subscribeCompanyToAddOn,
    cancelCompanyAddOn,
    subscribeUserToTier,
    changeUserTier,
    cancelUserSubscription,
    subscribeUserToAddOn,
    cancelUserAddOn,
    updateUsageLimit,
    resetUsage,
    updateUserUsageLimit,
    resetUserUsage,
    updateCompanyUsageLimit,
    resetCompanyUsage,
    getTrackingMode,
    refreshAll,
  };
}
