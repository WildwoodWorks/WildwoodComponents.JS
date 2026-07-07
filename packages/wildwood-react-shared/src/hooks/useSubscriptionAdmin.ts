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
  AppTierCancelResultModel,
  AppFeatureDefinitionModel,
  AppFeatureOverrideModel,
  TierChangePreviewModel,
} from '@wildwood/core';
import { useWildwood } from './useWildwood.js';
import { invalidateFeatures } from './useFeatures.js';

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
  previewTierChange: (
    appId: string,
    tierId: string,
    pricingId?: string,
    userId?: string,
  ) => Promise<TierChangePreviewModel>;

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
  getActiveFeatureDefinitions: (appId: string) => Promise<AppFeatureDefinitionModel[]>;
  getUserFeatures: (appId: string) => Promise<Record<string, boolean>>;

  // Limit statuses
  getLimitStatuses: (appId: string) => Promise<AppTierLimitStatusModel[]>;

  // Actions
  selfSubscribeTo: (
    appId: string,
    tierId: string,
    pricingId?: string,
    paymentTransactionId?: string,
  ) => Promise<AppTierChangeResultModel>;
  changeTier: (
    appId: string,
    tierId: string,
    pricingId?: string,
    immediate?: boolean,
    paymentTransactionId?: string,
  ) => Promise<AppTierChangeResultModel>;
  cancelSubscription: (appId: string) => Promise<AppTierCancelResultModel>;
  subscribeToAddOn: (
    appId: string,
    addOnId: string,
    pricingId?: string,
    paymentTransactionId?: string,
  ) => Promise<boolean>;
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
  cancelCompanySubscription: (appId: string, companyId: string) => Promise<AppTierCancelResultModel>;
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
  cancelUserSubscription: (appId: string, userId: string) => Promise<AppTierCancelResultModel>;
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

  // Entitlement-changing mutations must also refresh useFeatures/FeatureGate instances
  // elsewhere in the app — otherwise they serve the pre-mutation plan for the cache TTL.
  const wrapMutation = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      const result = await wrap(fn);
      invalidateFeatures();
      return result;
    },
    [wrap],
  );

  // The cancel endpoints report failures via success/errorMessage (they never throw), so
  // surface them in the hook's error state — otherwise a failed cancel is indistinguishable
  // from a successful one.
  const runCancel = useCallback(
    async (fn: () => Promise<AppTierCancelResultModel>): Promise<AppTierCancelResultModel> => {
      const result = await wrapMutation(fn);
      if (!result.success) setError(result.errorMessage ?? 'Failed to cancel subscription');
      return result;
    },
    [wrapMutation],
  );

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

  // User-facing (no admin role) — use in self-service contexts
  const getActiveFeatureDefinitions = useCallback(async (appId: string) => {
    const result = await clientRef.current.appTier.getActiveFeatureDefinitions(appId);
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
      return wrapMutation(() =>
        clientRef.current.appTier.setFeatureOverride(appId, userId, featureCode, isEnabled, reason, expiresAt),
      );
    },
    [wrapMutation],
  );

  const removeFeatureOverride = useCallback(
    async (appId: string, featureCode: string, userId?: string) => {
      return wrapMutation(() => clientRef.current.appTier.removeFeatureOverride(appId, featureCode, userId));
    },
    [wrapMutation],
  );

  // Actions
  const selfSubscribeTo = useCallback(
    async (appId: string, tierId: string, pricingId?: string, paymentTransactionId?: string) => {
      return wrapMutation(() =>
        clientRef.current.appTier.selfSubscribe(appId, tierId, pricingId, paymentTransactionId),
      );
    },
    [wrapMutation],
  );

  const changeTier = useCallback(
    async (appId: string, tierId: string, pricingId?: string, immediate?: boolean, paymentTransactionId?: string) => {
      return wrapMutation(() =>
        clientRef.current.appTier.changeTier(appId, tierId, pricingId, immediate, paymentTransactionId),
      );
    },
    [wrapMutation],
  );

  const cancelSubscription = useCallback(
    async (appId: string) => {
      return runCancel(() => clientRef.current.appTier.cancelSubscription(appId));
    },
    [runCancel],
  );

  const subscribeToAddOn = useCallback(
    async (appId: string, addOnId: string, pricingId?: string, paymentTransactionId?: string) => {
      return wrapMutation(() =>
        clientRef.current.appTier.subscribeToAddOn(appId, addOnId, pricingId, paymentTransactionId),
      );
    },
    [wrapMutation],
  );

  const cancelAddOn = useCallback(
    async (subscriptionId: string) => {
      return wrapMutation(() => clientRef.current.appTier.cancelAddOnSubscription(subscriptionId));
    },
    [wrapMutation],
  );

  // Company-scoped actions
  const subscribeCompanyToTier = useCallback(
    async (appId: string, companyId: string, tierId: string, pricingId?: string) => {
      return wrapMutation(() => clientRef.current.appTier.subscribeCompanyToTier(appId, companyId, tierId, pricingId));
    },
    [wrapMutation],
  );

  const changeCompanyTier = useCallback(
    async (appId: string, companyId: string, tierId: string, pricingId?: string, immediate?: boolean) => {
      return wrapMutation(() =>
        clientRef.current.appTier.changeCompanyTier(appId, companyId, tierId, pricingId, immediate),
      );
    },
    [wrapMutation],
  );

  const cancelCompanySubscription = useCallback(
    async (appId: string, companyId: string) => {
      return runCancel(() => clientRef.current.appTier.cancelCompanySubscription(appId, companyId));
    },
    [runCancel],
  );

  const subscribeCompanyToAddOn = useCallback(
    async (appId: string, companyId: string, addOnId: string) => {
      return wrapMutation(() => clientRef.current.appTier.subscribeCompanyToAddOn(appId, companyId, addOnId));
    },
    [wrapMutation],
  );

  const cancelCompanyAddOn = useCallback(
    async (subscriptionId: string, immediate?: boolean) => {
      return wrapMutation(() => clientRef.current.appTier.cancelCompanyAddOn(subscriptionId, immediate));
    },
    [wrapMutation],
  );

  // User-scoped admin actions
  const subscribeUserToTier = useCallback(
    async (appId: string, userId: string, tierId: string, pricingId?: string) => {
      return wrapMutation(() => clientRef.current.appTier.subscribeUserToTier(appId, userId, tierId, pricingId));
    },
    [wrapMutation],
  );

  const changeUserTier = useCallback(
    async (appId: string, userId: string, tierId: string, pricingId?: string, immediate?: boolean) => {
      return wrapMutation(() => clientRef.current.appTier.changeUserTier(appId, userId, tierId, pricingId, immediate));
    },
    [wrapMutation],
  );

  const cancelUserSubscription = useCallback(
    async (appId: string, userId: string) => {
      return runCancel(() => clientRef.current.appTier.cancelUserSubscription(appId, userId));
    },
    [runCancel],
  );

  const subscribeUserToAddOn = useCallback(
    async (appId: string, userId: string, addOnId: string) => {
      return wrapMutation(() => clientRef.current.appTier.subscribeUserToAddOn(appId, userId, addOnId));
    },
    [wrapMutation],
  );

  const cancelUserAddOn = useCallback(
    async (appId: string, subscriptionId: string) => {
      return wrapMutation(() => clientRef.current.appTier.cancelUserAddOn(appId, subscriptionId));
    },
    [wrapMutation],
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

  const previewTierChange = useCallback(async (appId: string, tierId: string, pricingId?: string, userId?: string) => {
    if (userId) {
      return clientRef.current.appTier.previewTierChangeAdmin(appId, userId, tierId, pricingId);
    }
    return clientRef.current.appTier.previewTierChange(appId, tierId, pricingId);
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
          // Self / current user context — skip admin-only endpoints.
          // Use the role-free /active feature-definitions endpoint so the
          // Features panel has definitions to render (getFeatureDefinitions
          // hits an Admin/CompanyAdmin-only endpoint).
          promises.push(
            getMySubscription(appId),
            getMyAddOns(appId),
            getLimitStatuses(appId),
            getActiveFeatureDefinitions(appId),
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
      getActiveFeatureDefinitions,
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
    previewTierChange,
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
    getActiveFeatureDefinitions,
    getUserFeatures,
    getLimitStatuses,
    getFeatureOverrides,
    setFeatureOverride,
    removeFeatureOverride,
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
