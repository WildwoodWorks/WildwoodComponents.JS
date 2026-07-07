// SubscriptionAdminComponent - ported from WildwoodComponents.Blazor Subscription/Admin/SubscriptionAdminComponent.razor
// Tabbed admin interface for subscription management with panels for status, tiers, features, add-ons, usage, and overrides.

import { useState, useEffect, useCallback } from 'react';
import type {
  TierChangePreviewModel,
  AppFeatureDefinitionModel,
  AppTierCancelResultModel,
  AppTierLimitStatusModel,
  UserTierSubscriptionModel,
} from '@wildwood/core';
import { useSubscriptionAdmin } from '../../../hooks/useSubscriptionAdmin.js';
import { SubscriptionStatusPanel } from './SubscriptionStatusPanel.js';
import { TierPlansPanel } from './TierPlansPanel.js';
import type { TierSelectedEventArgs } from './TierPlansPanel.js';
import { FeaturesPanel } from './FeaturesPanel.js';
import { AddOnsPanel } from './AddOnsPanel.js';
import { UsageLimitsPanel } from './UsageLimitsPanel.js';
import { OverridesPanel } from './OverridesPanel.js';
import { TierChangeConfirmationModal } from '../TierChangeConfirmationModal.js';

export type SubscriptionAdminDisplayMode = 'tabs' | 'subscription' | 'tiers' | 'features' | 'usage' | 'overrides';

export interface PaymentRequiredArgs {
  tierId: string;
  tierName: string;
  pricingId?: string;
  price?: number;
}

export interface SubscriptionAdminComponentProps {
  appId: string;
  companyId?: string;
  userId?: string;
  isAdmin?: boolean;
  displayMode?: SubscriptionAdminDisplayMode;
  currency?: string;
  showBillingToggle?: boolean;
  /** When true, render the subscription status card above the tab bar instead of as a tab */
  showStatusAboveTabs?: boolean;
  /**
   * Called when the server confirms a tier change requires payment and no card on file.
   * Return a payment transaction id (string) to complete the change, or null/undefined to cancel.
   * Consumers typically wire this to a modal containing PaymentFormComponent.
   */
  onPaymentRequired?: (args: PaymentRequiredArgs) => Promise<string | null | undefined>;
  /** Override the internally-fetched limit statuses (e.g. with locally-merged real-time usage data) */
  limitStatusesOverride?: unknown[];
  /**
   * Transform/merge the internally-fetched limit statuses before they are displayed
   * (e.g. overlay local real-time usage). Applied to the component's own data after every
   * refresh, so admin edits stay in sync. Prefer this over `limitStatusesOverride`.
   * May be sync or async. Memoize the callback (e.g. useCallback) to avoid redundant re-runs.
   */
  onMergeUsage?: (
    statuses: AppTierLimitStatusModel[],
    subscription: UserTierSubscriptionModel | null,
  ) => AppTierLimitStatusModel[] | Promise<AppTierLimitStatusModel[]>;
  onSubscriptionChanged?: () => void;
  className?: string;
}

type Tab = 'subscription' | 'tiers' | 'features' | 'usage' | 'overrides';

export function SubscriptionAdminComponent({
  appId,
  companyId,
  userId,
  isAdmin = false,
  displayMode = 'tabs',
  currency = 'USD',
  showBillingToggle = true,
  showStatusAboveTabs = false,
  onPaymentRequired,
  limitStatusesOverride,
  onMergeUsage,
  onSubscriptionChanged,
  className,
}: SubscriptionAdminComponentProps) {
  const admin = useSubscriptionAdmin();
  const [mergedLimitStatuses, setMergedLimitStatuses] = useState<AppTierLimitStatusModel[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>(showStatusAboveTabs ? 'tiers' : 'subscription');
  const [preview, setPreview] = useState<TierChangePreviewModel | null>(null);
  const [pendingArgs, setPendingArgs] = useState<TierSelectedEventArgs | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  // Result of the most recent cancel action, shown as a dismissible notice near the status
  // panel (mirrors the Swift lastCancelResult card): scheduled vs immediate, plus store
  // instructions when the subscription is store-billed (requiresUserAction).
  const [lastCancelResult, setLastCancelResult] = useState<AppTierCancelResultModel | null>(null);

  useEffect(() => {
    if (appId) {
      admin
        .refreshAll(appId, companyId, userId)
        .catch((e: unknown) => console.warn('Failed to load subscription data:', e));
    }
  }, [appId, companyId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply the consumer's merge transform to the component's own limit statuses.
  // Re-runs whenever the underlying data refreshes (e.g. after an admin edit) or the
  // merge callback's inputs change, keeping the displayed usage in sync.
  useEffect(() => {
    if (!onMergeUsage) {
      setMergedLimitStatuses(admin.limitStatuses);
      return;
    }
    let cancelled = false;
    Promise.resolve(onMergeUsage(admin.limitStatuses, admin.subscription))
      .then((result) => {
        if (!cancelled) setMergedLimitStatuses(result);
      })
      .catch(() => {
        if (!cancelled) setMergedLimitStatuses(admin.limitStatuses);
      });
    return () => {
      cancelled = true;
    };
  }, [admin.limitStatuses, admin.subscription, onMergeUsage]);

  const handleRefresh = useCallback(async () => {
    await admin.refreshAll(appId, companyId, userId);
    onSubscriptionChanged?.();
  }, [admin, appId, companyId, userId, onSubscriptionChanged]);

  const handleCancelSubscription = useCallback(async () => {
    let result: AppTierCancelResultModel;
    if (userId) {
      result = await admin.cancelUserSubscription(appId, userId);
    } else if (companyId) {
      result = await admin.cancelCompanySubscription(appId, companyId);
    } else {
      result = await admin.cancelSubscription(appId);
    }
    setLastCancelResult(result);
    // A failed cancel must not look successful: the hook already set admin.error,
    // so skip the refresh + onSubscriptionChanged success path.
    if (!result.success) return;
    await handleRefresh();
  }, [admin, appId, companyId, userId, handleRefresh]);

  const handleTierSelected = useCallback(
    async (args: TierSelectedEventArgs) => {
      try {
        const result = await admin.previewTierChange(appId, args.tierId, args.pricingId, userId);
        if (!result.success) {
          admin.clearError();
          throw new Error(result.errorMessage ?? 'Failed to preview tier change');
        }
        setPendingArgs(args);
        setPreview(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('Preview failed:', msg);
      }
    },
    [admin, appId, userId],
  );

  const handleConfirmChange = useCallback(
    async (options: { immediate: boolean; bypassPayment: boolean }) => {
      if (!pendingArgs) return;
      setConfirmLoading(true);
      admin.clearError();

      try {
        const doChange = async (txnId?: string) => {
          if (pendingArgs.isChange) {
            if (userId) {
              await admin.changeUserTier(appId, userId, pendingArgs.tierId, pendingArgs.pricingId, options.immediate);
            } else if (companyId) {
              await admin.changeCompanyTier(
                appId,
                companyId,
                pendingArgs.tierId,
                pendingArgs.pricingId,
                options.immediate,
              );
            } else {
              await admin.changeTier(appId, pendingArgs.tierId, pendingArgs.pricingId, options.immediate, txnId);
            }
          } else if (userId) {
            await admin.subscribeUserToTier(appId, userId, pendingArgs.tierId, pendingArgs.pricingId);
          } else if (companyId) {
            await admin.subscribeCompanyToTier(appId, companyId, pendingArgs.tierId, pendingArgs.pricingId);
          } else {
            await admin.selfSubscribeTo(appId, pendingArgs.tierId, pendingArgs.pricingId, txnId);
          }
        };

        // Admin-scoped changes (user/company) bypass payment server-side (IsAdminOverride)
        // and the change methods don't carry a txn id, so only collect payment for self.
        const isAdminScopedChange = !!userId || !!companyId;

        if (preview?.paymentRequired && !options.bypassPayment && !isAdminScopedChange) {
          if (!onPaymentRequired) {
            admin.clearError();
            throw new Error(
              'Payment is required for this tier change. Wire the onPaymentRequired callback to collect payment.',
            );
          }
          const txnId = await onPaymentRequired({
            tierId: pendingArgs.tierId,
            tierName: pendingArgs.tierName,
            pricingId: pendingArgs.pricingId,
            price: preview.proratedChargeToday ?? preview.newPrice ?? 0,
          });
          if (!txnId) {
            setConfirmLoading(false);
            return;
          }
          await doChange(txnId);
        } else {
          await doChange();
        }

        setPreview(null);
        setPendingArgs(null);
        await handleRefresh();
      } catch {
        // Error is surfaced via admin.error state
      } finally {
        setConfirmLoading(false);
      }
    },
    [admin, appId, companyId, userId, pendingArgs, preview, onPaymentRequired, handleRefresh],
  );

  const handleCancelConfirmation = useCallback(() => {
    setPreview(null);
    setPendingArgs(null);
  }, []);

  const handleAddOnSubscribe = useCallback(
    async (addOnId: string, pricingId?: string) => {
      if (userId) {
        await admin.subscribeUserToAddOn(appId, userId, addOnId);
      } else if (companyId) {
        await admin.subscribeCompanyToAddOn(appId, companyId, addOnId);
      } else {
        await admin.subscribeToAddOn(appId, addOnId, pricingId);
      }
      await handleRefresh();
    },
    [admin, appId, companyId, userId, handleRefresh],
  );

  const handleAddOnCancel = useCallback(
    async (subscriptionId: string) => {
      if (userId) {
        await admin.cancelUserAddOn(appId, subscriptionId);
      } else if (companyId) {
        await admin.cancelCompanyAddOn(subscriptionId);
      } else {
        await admin.cancelAddOn(subscriptionId);
      }
      await handleRefresh();
    },
    [admin, appId, companyId, userId, handleRefresh],
  );

  const handleToggleFeature = useCallback(
    async (featureCode: string, isEnabled: boolean, reason?: string, expiresAt?: string) => {
      const scopeUserId = userId ?? null;
      await admin.setFeatureOverride(appId, scopeUserId, featureCode, isEnabled, reason, expiresAt);
      await handleRefresh();
    },
    [admin, appId, userId, handleRefresh],
  );

  const handleRemoveOverride = useCallback(
    async (featureCode: string) => {
      await admin.removeFeatureOverride(appId, featureCode, userId);
      await handleRefresh();
    },
    [admin, appId, userId, handleRefresh],
  );

  const handleMakePermanent = useCallback(
    async (ov: { featureCode: string; isEnabled: boolean; reason?: string }) => {
      const scopeUserId = userId ?? null;
      await admin.setFeatureOverride(appId, scopeUserId, ov.featureCode, ov.isEnabled, ov.reason, undefined);
      await handleRefresh();
    },
    [admin, appId, userId, handleRefresh],
  );

  const handleUpdateLimit = useCallback(
    async (limitCode: string, newMaxValue: number) => {
      if (userId) {
        await admin.updateUserUsageLimit(appId, userId, limitCode, newMaxValue);
      } else if (companyId) {
        await admin.updateCompanyUsageLimit(appId, companyId, limitCode, newMaxValue);
      } else {
        await admin.updateUsageLimit(appId, limitCode, newMaxValue);
      }
      await handleRefresh();
    },
    [admin, appId, companyId, userId, handleRefresh],
  );

  const handleResetUsage = useCallback(
    async (limitCode: string) => {
      if (userId) {
        await admin.resetUserUsage(appId, userId, limitCode);
      } else if (companyId) {
        await admin.resetCompanyUsage(appId, companyId, limitCode);
      } else {
        await admin.resetUsage(appId, limitCode);
      }
      await handleRefresh();
    },
    [admin, appId, companyId, userId, handleRefresh],
  );

  if (!appId) {
    return (
      <div className={`ww-sub-admin ${className ?? ''}`}>
        <div className="ww-alert ww-alert-warning">AppId is required.</div>
      </div>
    );
  }

  // Merge feature definitions with status
  const mergedFeatures = admin.featureDefinitions.map((def: AppFeatureDefinitionModel) => ({
    ...def,
    isEnabled: admin.featureStatus[def.featureCode] ?? false,
  }));

  const featuresPanel = (
    <FeaturesPanel
      features={mergedFeatures}
      featureOverrides={admin.featureOverrides}
      isAdmin={isAdmin}
      loading={admin.loading}
      onToggleFeature={isAdmin ? handleToggleFeature : undefined}
    />
  );

  const addOnsPanel = (
    <AddOnsPanel
      addOns={admin.addOns}
      subscriptions={admin.addOnSubscriptions}
      currentTierId={admin.subscription?.appTierId}
      loading={admin.loading}
      currency={currency}
      onSubscribe={handleAddOnSubscribe}
      onCancel={handleAddOnCancel}
    />
  );

  // Resolve which limit statuses to display, in priority order:
  //  1. An explicit non-empty `limitStatusesOverride` (legacy escape hatch).
  //  2. The `onMergeUsage` result (falling back to raw data during the brief
  //     window before the merge effect has produced output).
  //  3. The raw internally-fetched statuses.
  // An empty override/merge must never blank out the panel when raw data exists.
  let effectiveLimitStatuses: typeof admin.limitStatuses;
  if (limitStatusesOverride && limitStatusesOverride.length > 0) {
    effectiveLimitStatuses = limitStatusesOverride as typeof admin.limitStatuses;
  } else if (onMergeUsage) {
    effectiveLimitStatuses = mergedLimitStatuses.length > 0 ? mergedLimitStatuses : admin.limitStatuses;
  } else {
    effectiveLimitStatuses = admin.limitStatuses;
  }

  const usageLimitsPanel = (
    <UsageLimitsPanel
      limitStatuses={effectiveLimitStatuses}
      isAdmin={isAdmin}
      loading={admin.loading}
      onUpdateLimit={isAdmin ? handleUpdateLimit : undefined}
      onResetUsage={isAdmin ? handleResetUsage : undefined}
    />
  );

  // Dismissible cancel-result notice, rendered near the status panel. Only successful
  // cancels render here — a failed cancel surfaces through the admin.error alert.
  const cancelNotice = lastCancelResult?.success ? (
    <div className="ww-alert ww-alert-info ww-sub-cancel-notice">
      <span>
        {lastCancelResult.isScheduled
          ? `Your cancellation is scheduled — access continues until ${
              lastCancelResult.effectiveDate
                ? new Date(lastCancelResult.effectiveDate).toLocaleDateString()
                : 'the end of the billing period'
            }.`
          : 'Your subscription has been cancelled.'}
        {lastCancelResult.requiresUserAction && (
          <>
            {' '}
            {lastCancelResult.userActionInstructions ?? 'Also cancel the subscription in your store settings.'}
            {lastCancelResult.userActionUrl && (
              <>
                {' '}
                <a href={lastCancelResult.userActionUrl} target="_blank" rel="noopener noreferrer">
                  Open subscription settings
                </a>
              </>
            )}
          </>
        )}
      </span>
      <button type="button" className="ww-alert-dismiss" onClick={() => setLastCancelResult(null)}>
        &times;
      </button>
    </div>
  ) : null;

  const overridesPanel = isAdmin ? (
    <OverridesPanel
      overrides={admin.featureOverrides}
      loading={admin.loading}
      onRemoveOverride={handleRemoveOverride}
      onMakePermanent={handleMakePermanent}
    />
  ) : null;

  // Single panel mode
  if (displayMode !== 'tabs') {
    return (
      <div className={`ww-sub-admin ${className ?? ''}`}>
        {admin.error && (
          <div className="ww-alert ww-alert-danger">
            {admin.error}
            <button type="button" className="ww-alert-dismiss" onClick={() => admin.clearError()}>
              &times;
            </button>
          </div>
        )}
        {cancelNotice}
        {displayMode === 'subscription' && (
          <SubscriptionStatusPanel
            subscription={admin.subscription}
            loading={admin.loading}
            onCancelRequested={handleCancelSubscription}
          />
        )}
        {displayMode === 'tiers' && (
          <TierPlansPanel
            tiers={admin.tiers}
            currentTierId={admin.subscription?.appTierId}
            loading={admin.loading}
            showBillingToggle={showBillingToggle}
            currency={currency}
            onTierSelected={handleTierSelected}
          />
        )}
        {displayMode === 'features' && (
          <>
            {featuresPanel}
            {addOnsPanel}
          </>
        )}
        {displayMode === 'usage' && usageLimitsPanel}
        {displayMode === 'overrides' && overridesPanel}
      </div>
    );
  }

  // Tabbed mode — optionally show status above tabs
  const tabs: { key: Tab; label: string }[] = [];

  if (!showStatusAboveTabs) {
    tabs.push({ key: 'subscription', label: 'Subscription' });
  }
  tabs.push(
    { key: 'tiers', label: 'Plans' },
    { key: 'features', label: 'Features & Add-Ons' },
    { key: 'usage', label: 'Usage' },
  );
  if (isAdmin) {
    tabs.push({ key: 'overrides', label: 'Overrides' });
  }

  return (
    <div className={`ww-sub-admin ${className ?? ''}`}>
      {admin.error && (
        <div className="ww-alert ww-alert-danger">
          {admin.error}
          <button type="button" className="ww-alert-dismiss" onClick={() => admin.clearError()}>
            &times;
          </button>
        </div>
      )}

      {cancelNotice}

      {showStatusAboveTabs && (
        <div className="ww-sub-status-card">
          <SubscriptionStatusPanel
            subscription={admin.subscription}
            loading={admin.loading}
            onCancelRequested={handleCancelSubscription}
          />
        </div>
      )}

      <div className="ww-sub-admin-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`ww-sub-admin-tab ${activeTab === tab.key ? 'ww-sub-admin-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="ww-sub-admin-content">
        {activeTab === 'subscription' && !showStatusAboveTabs && (
          <SubscriptionStatusPanel
            subscription={admin.subscription}
            loading={admin.loading}
            onCancelRequested={handleCancelSubscription}
          />
        )}
        {activeTab === 'tiers' && (
          <TierPlansPanel
            tiers={admin.tiers}
            currentTierId={admin.subscription?.appTierId}
            loading={admin.loading}
            showBillingToggle={showBillingToggle}
            currency={currency}
            onTierSelected={handleTierSelected}
          />
        )}
        {activeTab === 'features' && (
          <>
            {featuresPanel}
            {addOnsPanel}
          </>
        )}
        {activeTab === 'usage' && usageLimitsPanel}
        {activeTab === 'overrides' && overridesPanel}
      </div>

      {preview && (
        <TierChangeConfirmationModal
          preview={preview}
          onConfirm={handleConfirmChange}
          onCancel={handleCancelConfirmation}
          loading={confirmLoading}
        />
      )}
    </div>
  );
}
