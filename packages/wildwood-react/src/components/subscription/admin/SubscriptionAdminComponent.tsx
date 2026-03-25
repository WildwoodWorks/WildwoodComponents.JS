// SubscriptionAdminComponent - ported from WildwoodComponents.Blazor Subscription/Admin/SubscriptionAdminComponent.razor
// Tabbed admin interface for subscription management with panels for status, tiers, features, add-ons, usage, and overrides.

import { useState, useEffect, useCallback } from 'react';
import { useSubscriptionAdmin } from '../../../hooks/useSubscriptionAdmin.js';
import { SubscriptionStatusPanel } from './SubscriptionStatusPanel.js';
import { TierPlansPanel } from './TierPlansPanel.js';
import type { TierSelectedEventArgs } from './TierPlansPanel.js';
import { FeaturesPanel } from './FeaturesPanel.js';
import { AddOnsPanel } from './AddOnsPanel.js';
import { UsageLimitsPanel } from './UsageLimitsPanel.js';
import { OverridesPanel } from './OverridesPanel.js';

export type SubscriptionAdminDisplayMode = 'tabs' | 'subscription' | 'tiers' | 'features' | 'usage' | 'overrides';

export interface SubscriptionAdminComponentProps {
  appId: string;
  companyId?: string;
  userId?: string;
  isAdmin?: boolean;
  displayMode?: SubscriptionAdminDisplayMode;
  /** When true, use self-service endpoints (POST /my-subscription) instead of admin endpoints */
  selfService?: boolean;
  currency?: string;
  showBillingToggle?: boolean;
  /** When true, render the subscription status card above the tab bar instead of as a tab */
  showStatusAboveTabs?: boolean;
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
  selfService = false,
  currency = 'USD',
  showBillingToggle = true,
  showStatusAboveTabs = false,
  onSubscriptionChanged,
  className,
}: SubscriptionAdminComponentProps) {
  const admin = useSubscriptionAdmin();
  const [activeTab, setActiveTab] = useState<Tab>(showStatusAboveTabs ? 'tiers' : 'subscription');

  useEffect(() => {
    if (appId) {
      admin.refreshAll(appId, companyId, userId).catch((err) => console.warn('Failed to load subscription data:', err));
    }
  }, [appId, companyId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(async () => {
    await admin.refreshAll(appId, companyId, userId);
    onSubscriptionChanged?.();
  }, [admin, appId, companyId, userId, onSubscriptionChanged]);

  const handleCancelSubscription = useCallback(async () => {
    if (userId) {
      await admin.cancelUserSubscription(appId, userId);
    } else if (companyId) {
      await admin.cancelCompanySubscription(appId, companyId);
    } else {
      await admin.cancelSubscription(appId);
    }
    await handleRefresh();
  }, [admin, appId, companyId, userId, handleRefresh]);

  const handleTierSelected = useCallback(
    async (args: TierSelectedEventArgs) => {
      if (userId) {
        await admin.subscribeUserToTier(appId, userId, args.tierId, args.pricingId);
      } else if (companyId) {
        await admin.subscribeCompanyToTier(appId, companyId, args.tierId, args.pricingId);
      } else if (selfService) {
        await admin.selfSubscribeTo(appId, args.tierId, args.pricingId);
      } else {
        await admin.subscribeTo(appId, args.tierId, args.pricingId);
      }
      await handleRefresh();
    },
    [admin, appId, companyId, userId, selfService, handleRefresh],
  );

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
  const mergedFeatures = admin.featureDefinitions.map((def) => ({
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

  const usageLimitsPanel = (
    <UsageLimitsPanel
      limitStatuses={admin.limitStatuses}
      isAdmin={isAdmin}
      loading={admin.loading}
      onUpdateLimit={isAdmin ? handleUpdateLimit : undefined}
      onResetUsage={isAdmin ? handleResetUsage : undefined}
    />
  );

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
    </div>
  );
}
