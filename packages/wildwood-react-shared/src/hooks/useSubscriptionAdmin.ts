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
  SelfChangeTierOptions,
  TrialEligibilityModel,
  AddOnSubscribeResultModel,
  AddOnSubscriptionCancelResultModel,
  AddOnSubscriptionReactivateResultModel,
} from '@wildwood/core';
import type { EntitlementsChangedReason } from '../subscription/entitlements.js';
import { useWildwood } from './useWildwood.js';
import { invalidateFeatures } from './useFeatures.js';

/**
 * What to show when the server refused something and said nothing useful about why. Prefer the
 * server's own message; fall back to naming the operation, with its error code when there is one.
 */
function refusalMessage(operation: string, message?: string | null, code?: string | null): string {
  if (message) return message;
  if (code) return `The request was refused: could not ${operation} (${code}).`;
  return `The request was refused: could not ${operation}.`;
}

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
  /** The app's packs as an unauthenticated visitor sees them (Active only, with pricing). */
  getPublicAddOns: (appId: string) => Promise<AppTierAddOnModel[]>;
  previewTierChange: (
    appId: string,
    tierId: string,
    pricingId?: string,
    userId?: string,
  ) => Promise<TierChangePreviewModel>;
  /** Whether this account may still start a free trial, on a tier and per pack. Never throws. */
  getTrialEligibility: (appId: string) => Promise<TrialEligibilityModel>;

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
  /**
   * The options form of the self-service tier change. With `supportsPaymentAction: true` a change
   * whose proration needs 3-D Secure comes back `requiresAction` with a `clientSecret` and a
   * `pendingChangeId` to finish through {@link UseSubscriptionAdminReturn.completeTierChange},
   * instead of being refused.
   */
  changeTierWithOptions: (appId: string, options: SelfChangeTierOptions) => Promise<AppTierChangeResultModel>;
  /** Finish a plan change parked on 3-D Secure, once the prorated charge has been confirmed. */
  completeTierChange: (appId: string, pendingChangeId: string) => Promise<AppTierChangeResultModel>;
  cancelSubscription: (appId: string) => Promise<AppTierCancelResultModel>;
  subscribeToAddOn: (
    appId: string,
    addOnId: string,
    pricingId?: string,
    paymentTransactionId?: string,
  ) => Promise<boolean>;
  /** Subscribe to one pack, reporting WHY it was refused instead of a bare false. */
  subscribeToAddOnDetailed: (
    appId: string,
    addOnId: string,
    pricingId?: string,
    paymentTransactionId?: string,
  ) => Promise<AddOnSubscribeResultModel>;
  cancelAddOn: (subscriptionId: string) => Promise<boolean>;
  /** Cancel one pack, saying whether access continues to the end of the paid period. */
  cancelAddOnDetailed: (subscriptionId: string, immediate?: boolean) => Promise<AddOnSubscriptionCancelResultModel>;
  /** Take back a scheduled pack cancellation. */
  reactivateAddOn: (subscriptionId: string) => Promise<AddOnSubscriptionReactivateResultModel>;

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
  // elsewhere in the app — otherwise they serve the pre-mutation plan for the cache TTL — and
  // announce the change on the client's emitter, so anything else in the app (a subscription
  // panel, a usage meter, the host's own listener) can re-read rather than sit on stale state.
  const wrapMutation = useCallback(
    async <T>(reason: EntitlementsChangedReason, appId: string | undefined, fn: () => Promise<T>): Promise<T> => {
      const result = await wrap(fn);
      invalidateFeatures();
      clientRef.current.events.emit('entitlementsChanged', {
        // The subscription-scoped endpoints take no appId; they are always about the current app.
        appId: appId || clientRef.current.config.appId || '',
        reason,
      });
      return result;
    },
    [wrap],
  );

  // The cancel endpoints report failures via success/errorMessage (they never throw), so
  // surface them in the hook's error state — otherwise a failed cancel is indistinguishable
  // from a successful one.
  const runCancel = useCallback(
    async (
      appId: string | undefined,
      fn: () => Promise<AppTierCancelResultModel>,
    ): Promise<AppTierCancelResultModel> => {
      const result = await wrapMutation('cancel', appId, fn);
      if (!result.success) setError(result.errorMessage ?? 'Failed to cancel subscription');
      return result;
    },
    [wrapMutation],
  );

  // Same problem, one step worse: these endpoints answer a bare boolean, so a refusal used to look
  // exactly like a success. Keep returning the boolean — callers branch on it — but say so.
  const runFlag = useCallback(async (operation: string, run: Promise<boolean>): Promise<boolean> => {
    const ok = await run;
    if (!ok) setError(refusalMessage(operation));
    return ok;
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

  const getPublicAddOns = useCallback(async (appId: string) => {
    const result = await clientRef.current.appTier.getPublicAddOns(appId);
    setAddOns(result);
    return result;
  }, []);

  const getTrialEligibility = useCallback(async (appId: string) => {
    return clientRef.current.appTier.trialEligibility(appId);
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
      return runFlag(
        'set the feature override',
        wrapMutation('manual', appId, () =>
          clientRef.current.appTier.setFeatureOverride(appId, userId, featureCode, isEnabled, reason, expiresAt),
        ),
      );
    },
    [wrapMutation, runFlag],
  );

  const removeFeatureOverride = useCallback(
    async (appId: string, featureCode: string, userId?: string) => {
      return runFlag(
        'remove the feature override',
        wrapMutation('manual', appId, () =>
          clientRef.current.appTier.removeFeatureOverride(appId, featureCode, userId),
        ),
      );
    },
    [wrapMutation, runFlag],
  );

  // Actions
  const selfSubscribeTo = useCallback(
    async (appId: string, tierId: string, pricingId?: string, paymentTransactionId?: string) => {
      return wrapMutation('tierChange', appId, () =>
        clientRef.current.appTier.selfSubscribe(appId, tierId, pricingId, paymentTransactionId),
      );
    },
    [wrapMutation],
  );

  const changeTier = useCallback(
    async (appId: string, tierId: string, pricingId?: string, immediate?: boolean, paymentTransactionId?: string) => {
      return wrapMutation('tierChange', appId, () =>
        clientRef.current.appTier.changeTier(appId, tierId, pricingId, immediate, paymentTransactionId),
      );
    },
    [wrapMutation],
  );

  const changeTierWithOptions = useCallback(
    async (appId: string, options: SelfChangeTierOptions) => {
      const result = await wrapMutation('tierChange', appId, () =>
        clientRef.current.appTier.changeTier(appId, options),
      );
      // requiresAction/processing are "not yet", not "no" — they are the 3-D Secure path, so they
      // must not be reported to the user as a failed change.
      if (!result.success && !result.requiresAction && !result.processing) {
        setError(refusalMessage('change the plan', result.errorMessage, result.errorCode));
      }
      return result;
    },
    [wrapMutation],
  );

  const completeTierChange = useCallback(
    async (appId: string, pendingChangeId: string) => {
      const result = await wrapMutation('tierChange', appId, () =>
        clientRef.current.appTier.completeTierChange(appId, pendingChangeId),
      );
      if (!result.success && !result.requiresAction && !result.processing) {
        setError(refusalMessage('complete the plan change', result.errorMessage, result.errorCode));
      }
      return result;
    },
    [wrapMutation],
  );

  const cancelSubscription = useCallback(
    async (appId: string) => {
      return runCancel(appId, () => clientRef.current.appTier.cancelSubscription(appId));
    },
    [runCancel],
  );

  const subscribeToAddOn = useCallback(
    async (appId: string, addOnId: string, pricingId?: string, paymentTransactionId?: string) => {
      return runFlag(
        'subscribe to the pack',
        wrapMutation('addOn', appId, () =>
          clientRef.current.appTier.subscribeToAddOn(appId, addOnId, pricingId, paymentTransactionId),
        ),
      );
    },
    [wrapMutation, runFlag],
  );

  const subscribeToAddOnDetailed = useCallback(
    async (appId: string, addOnId: string, pricingId?: string, paymentTransactionId?: string) => {
      const result = await wrapMutation('addOn', appId, () =>
        clientRef.current.appTier.subscribeToAddOnDetailed(appId, addOnId, pricingId, paymentTransactionId),
      );
      if (!result.success) {
        setError(refusalMessage('subscribe to the pack', result.error.message, result.error.code));
      }
      return result;
    },
    [wrapMutation],
  );

  const cancelAddOn = useCallback(
    async (subscriptionId: string) => {
      return runFlag(
        'cancel the pack',
        wrapMutation('cancel', undefined, () => clientRef.current.appTier.cancelAddOnSubscription(subscriptionId)),
      );
    },
    [wrapMutation, runFlag],
  );

  const cancelAddOnDetailed = useCallback(
    async (subscriptionId: string, immediate?: boolean) => {
      const result = await wrapMutation('cancel', undefined, () =>
        clientRef.current.appTier.cancelAddOnDetailed(subscriptionId, immediate),
      );
      if (!result.success) {
        setError(refusalMessage('cancel the pack', result.errorMessage, result.errorCode));
      }
      return result;
    },
    [wrapMutation],
  );

  const reactivateAddOn = useCallback(
    async (subscriptionId: string) => {
      const result = await wrapMutation('reactivate', undefined, () =>
        clientRef.current.appTier.reactivateAddOn(subscriptionId),
      );
      if (!result.success) {
        setError(refusalMessage('reactivate the pack', result.errorMessage, result.errorCode));
      }
      return result;
    },
    [wrapMutation],
  );

  // Company-scoped actions
  const subscribeCompanyToTier = useCallback(
    async (appId: string, companyId: string, tierId: string, pricingId?: string) => {
      return wrapMutation('tierChange', appId, () =>
        clientRef.current.appTier.subscribeCompanyToTier(appId, companyId, tierId, pricingId),
      );
    },
    [wrapMutation],
  );

  const changeCompanyTier = useCallback(
    async (appId: string, companyId: string, tierId: string, pricingId?: string, immediate?: boolean) => {
      return wrapMutation('tierChange', appId, () =>
        clientRef.current.appTier.changeCompanyTier(appId, companyId, tierId, pricingId, immediate),
      );
    },
    [wrapMutation],
  );

  const cancelCompanySubscription = useCallback(
    async (appId: string, companyId: string) => {
      return runCancel(appId, () => clientRef.current.appTier.cancelCompanySubscription(appId, companyId));
    },
    [runCancel],
  );

  const subscribeCompanyToAddOn = useCallback(
    async (appId: string, companyId: string, addOnId: string) => {
      return runFlag(
        'subscribe the company to the pack',
        wrapMutation('addOn', appId, () =>
          clientRef.current.appTier.subscribeCompanyToAddOn(appId, companyId, addOnId),
        ),
      );
    },
    [wrapMutation, runFlag],
  );

  const cancelCompanyAddOn = useCallback(
    async (subscriptionId: string, immediate?: boolean) => {
      return runFlag(
        "cancel the company's pack",
        wrapMutation('cancel', undefined, () =>
          clientRef.current.appTier.cancelCompanyAddOn(subscriptionId, immediate),
        ),
      );
    },
    [wrapMutation, runFlag],
  );

  // User-scoped admin actions
  const subscribeUserToTier = useCallback(
    async (appId: string, userId: string, tierId: string, pricingId?: string) => {
      return wrapMutation('tierChange', appId, () =>
        clientRef.current.appTier.subscribeUserToTier(appId, userId, tierId, pricingId),
      );
    },
    [wrapMutation],
  );

  const changeUserTier = useCallback(
    async (appId: string, userId: string, tierId: string, pricingId?: string, immediate?: boolean) => {
      return wrapMutation('tierChange', appId, () =>
        clientRef.current.appTier.changeUserTier(appId, userId, tierId, pricingId, immediate),
      );
    },
    [wrapMutation],
  );

  const cancelUserSubscription = useCallback(
    async (appId: string, userId: string) => {
      return runCancel(appId, () => clientRef.current.appTier.cancelUserSubscription(appId, userId));
    },
    [runCancel],
  );

  const subscribeUserToAddOn = useCallback(
    async (appId: string, userId: string, addOnId: string) => {
      return runFlag(
        'subscribe the user to the pack',
        wrapMutation('addOn', appId, () => clientRef.current.appTier.subscribeUserToAddOn(appId, userId, addOnId)),
      );
    },
    [wrapMutation, runFlag],
  );

  const cancelUserAddOn = useCallback(
    async (appId: string, subscriptionId: string) => {
      return runFlag(
        "cancel the user's pack",
        wrapMutation('cancel', appId, () => clientRef.current.appTier.cancelUserAddOn(appId, subscriptionId)),
      );
    },
    [wrapMutation, runFlag],
  );

  // Usage limit overrides (admin)
  const updateUsageLimit = useCallback(
    async (appId: string, limitCode: string, newMaxValue: number) => {
      return runFlag(
        'update the usage limit',
        wrap(() => clientRef.current.appTier.updateUsageLimit(appId, limitCode, newMaxValue)),
      );
    },
    [wrap, runFlag],
  );

  const resetUsage = useCallback(
    async (appId: string, limitCode: string) => {
      return runFlag(
        'reset the usage counter',
        wrap(() => clientRef.current.appTier.resetUsage(appId, limitCode)),
      );
    },
    [wrap, runFlag],
  );

  const updateUserUsageLimit = useCallback(
    async (appId: string, userId: string, limitCode: string, newMaxValue: number) => {
      return runFlag(
        "update the user's usage limit",
        wrap(() => clientRef.current.appTier.updateUserUsageLimit(appId, userId, limitCode, newMaxValue)),
      );
    },
    [wrap, runFlag],
  );

  const resetUserUsage = useCallback(
    async (appId: string, userId: string, limitCode: string) => {
      return runFlag(
        "reset the user's usage counter",
        wrap(() => clientRef.current.appTier.resetUserUsage(appId, userId, limitCode)),
      );
    },
    [wrap, runFlag],
  );

  const updateCompanyUsageLimit = useCallback(
    async (appId: string, companyId: string, limitCode: string, newMaxValue: number) => {
      return runFlag(
        "update the company's usage limit",
        wrap(() => clientRef.current.appTier.updateCompanyUsageLimit(appId, companyId, limitCode, newMaxValue)),
      );
    },
    [wrap, runFlag],
  );

  const resetCompanyUsage = useCallback(
    async (appId: string, companyId: string, limitCode: string) => {
      return runFlag(
        "reset the company's usage counter",
        wrap(() => clientRef.current.appTier.resetCompanyUsage(appId, companyId, limitCode)),
      );
    },
    [wrap, runFlag],
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
    getPublicAddOns,
    previewTierChange,
    getTrialEligibility,
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
    changeTierWithOptions,
    completeTierChange,
    cancelSubscription,
    subscribeToAddOn,
    subscribeToAddOnDetailed,
    cancelAddOn,
    cancelAddOnDetailed,
    reactivateAddOn,
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
