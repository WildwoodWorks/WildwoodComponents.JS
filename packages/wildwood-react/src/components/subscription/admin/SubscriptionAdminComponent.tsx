// SubscriptionAdminComponent - ported from WildwoodComponents.Blazor Subscription/Admin/SubscriptionAdminComponent.razor
// Tabbed admin interface for subscription management with panels for status, tiers, features, add-ons, and usage.

import { useState, useEffect, useCallback } from 'react';
import { useSubscriptionAdmin } from '../../../hooks/useSubscriptionAdmin.js';
import { SubscriptionStatusPanel } from './SubscriptionStatusPanel.js';
import { TierPlansPanel } from './TierPlansPanel.js';
import type { TierSelectedEventArgs } from './TierPlansPanel.js';
import { FeaturesPanel } from './FeaturesPanel.js';
import { AddOnsPanel } from './AddOnsPanel.js';
import { UsageLimitsPanel } from './UsageLimitsPanel.js';

export type SubscriptionAdminDisplayMode = 'tabs' | 'subscription' | 'tiers' | 'features' | 'usage';

export interface SubscriptionAdminComponentProps {
  appId: string;
  companyId?: string;
  displayMode?: SubscriptionAdminDisplayMode;
  isAdmin?: boolean;
  currency?: string;
  showBillingToggle?: boolean;
  onSubscriptionChanged?: () => void;
  className?: string;
}

type Tab = 'subscription' | 'tiers' | 'features' | 'usage';

export function SubscriptionAdminComponent({
  appId,
  companyId,
  displayMode = 'tabs',
  isAdmin = false,
  currency = 'USD',
  showBillingToggle = true,
  onSubscriptionChanged,
  className,
}: SubscriptionAdminComponentProps) {
  const admin = useSubscriptionAdmin();
  const [activeTab, setActiveTab] = useState<Tab>('subscription');

  useEffect(() => {
    if (appId) {
      admin.refreshAll(appId, companyId);
    }
  }, [appId, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(async () => {
    await admin.refreshAll(appId, companyId);
    onSubscriptionChanged?.();
  }, [admin, appId, companyId, onSubscriptionChanged]);

  const handleCancelSubscription = useCallback(async () => {
    if (companyId) {
      await admin.cancelCompanySubscription(appId, companyId);
    } else {
      await admin.cancelSubscription(appId);
    }
    await handleRefresh();
  }, [admin, appId, companyId, handleRefresh]);

  const handleTierSelected = useCallback(
    async (args: TierSelectedEventArgs) => {
      if (companyId) {
        await admin.subscribeCompanyToTier(appId, companyId, args.tierId, args.pricingId);
      } else {
        await admin.subscribeTo(appId, args.tierId, args.pricingId);
      }
      await handleRefresh();
    },
    [admin, appId, companyId, handleRefresh],
  );

  const handleAddOnSubscribe = useCallback(
    async (addOnId: string, pricingId?: string) => {
      if (companyId) {
        await admin.subscribeCompanyToAddOn(appId, companyId, addOnId);
      } else {
        await admin.subscribeToAddOn(appId, addOnId, pricingId);
      }
      await handleRefresh();
    },
    [admin, appId, companyId, handleRefresh],
  );

  const handleAddOnCancel = useCallback(
    async (subscriptionId: string) => {
      if (companyId) {
        await admin.cancelCompanyAddOn(subscriptionId);
      } else {
        await admin.cancelAddOn(subscriptionId);
      }
      await handleRefresh();
    },
    [admin, companyId, handleRefresh],
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

  // Single panel mode
  if (displayMode !== 'tabs') {
    return (
      <div className={`ww-sub-admin ${className ?? ''}`}>
        {admin.error && <div className="ww-alert ww-alert-danger">{admin.error}</div>}
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
            <FeaturesPanel features={mergedFeatures} loading={admin.loading} />
            <AddOnsPanel
              addOns={admin.addOns}
              subscriptions={admin.addOnSubscriptions}
              currentTierId={admin.subscription?.appTierId}
              loading={admin.loading}
              currency={currency}
              onSubscribe={handleAddOnSubscribe}
              onCancel={handleAddOnCancel}
            />
          </>
        )}
        {displayMode === 'usage' && <UsageLimitsPanel limitStatuses={admin.limitStatuses} loading={admin.loading} />}
      </div>
    );
  }

  // Tabbed mode
  const tabs: { key: Tab; label: string }[] = [
    { key: 'subscription', label: 'Subscription' },
    { key: 'tiers', label: 'Plans' },
    { key: 'features', label: 'Features & Add-Ons' },
    { key: 'usage', label: 'Usage' },
  ];

  return (
    <div className={`ww-sub-admin ${className ?? ''}`}>
      {admin.error && (
        <div className="ww-alert ww-alert-danger">
          {admin.error}
          <button type="button" className="ww-alert-dismiss" onClick={() => {}}>
            &times;
          </button>
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
        {activeTab === 'subscription' && (
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
            <FeaturesPanel features={mergedFeatures} loading={admin.loading} />
            <AddOnsPanel
              addOns={admin.addOns}
              subscriptions={admin.addOnSubscriptions}
              currentTierId={admin.subscription?.appTierId}
              loading={admin.loading}
              currency={currency}
              onSubscribe={handleAddOnSubscribe}
              onCancel={handleAddOnCancel}
            />
          </>
        )}
        {activeTab === 'usage' && <UsageLimitsPanel limitStatuses={admin.limitStatuses} loading={admin.loading} />}
      </div>
    </div>
  );
}
