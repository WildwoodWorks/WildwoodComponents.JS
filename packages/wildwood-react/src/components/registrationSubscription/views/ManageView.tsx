'use client';

// The manage view: what a customer already pays for, and every way of changing it.
//
// The panels are the platform's own - the same status card, plan grid, features, packs, usage and
// overrides the admin surfaces have always rendered - so a site swapping its hand-built plan page
// for this keeps its markup and its locators. What is new is the middle: the plan change runs
// through `usePlanChangeFlow`, so a preview is confirmed in EVERY layout, a card is asked for by
// the component itself when the host did not bring its own modal, and a prorated charge the bank
// wants to see is authenticated and the parked change completed instead of being refused.
//
// Packs are the other half. A pack is bought through the same card-once checkout the signup uses,
// cancelled at the end of the period it is paid up to, and a scheduled cancellation can be taken
// back. A pack nobody paid for - a registration token's, an admin's - says so, shows no renewal
// date and is simply removed when it is cancelled.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppFeatureDefinitionModel, AppTierCancelResultModel, AppTierLimitStatusModel } from '@wildwood/core';
import { grantsAccess } from '@wildwood/react-shared';
import { useSubscriptionAdmin } from '../../../hooks/useSubscriptionAdmin.js';
import { useWildwood } from '../../../hooks/useWildwood.js';
import { AddOnsPanel } from '../../subscription/admin/AddOnsPanel.js';
import { FeaturesPanel } from '../../subscription/admin/FeaturesPanel.js';
import { OverridesPanel } from '../../subscription/admin/OverridesPanel.js';
import { SubscriptionStatusPanel } from '../../subscription/admin/SubscriptionStatusPanel.js';
import { TierPlansPanel } from '../../subscription/admin/TierPlansPanel.js';
import { UsageLimitsPanel } from '../../subscription/admin/UsageLimitsPanel.js';
import { TierChangeConfirmationModal } from '../../subscription/TierChangeConfirmationModal.js';
import { CancelResultNotice } from '../../subscription/CancelResultNotice.js';
import { PackPicker } from '../parts/PackPicker.js';
import { PaymentModal } from '../parts/PaymentModal.js';
import { PlanChangeNotice } from '../parts/PlanChangeNotice.js';
import { resolveLabels } from '../labels.js';
import type { ManageSection, RegistrationSubscriptionManageProps } from '../types.js';
import { usePlanChangeFlow } from './usePlanChangeFlow.js';

/** The sections a viewer may see, in the order they render when the host names none. */
const ALL_SECTIONS: ManageSection[] = ['subscription', 'plans', 'features', 'addOns', 'usage', 'overrides'];

export function RegistrationSubscriptionManage(props: RegistrationSubscriptionManageProps) {
  const {
    appId,
    className,
    currency,
    contactUrl,
    labels: labelOverrides,
    onError,
    layout = 'tabs',
    sections,
    showStatusAboveTabs = false,
    isAdmin = false,
    userId,
    companyId,
    allowPackSelfService = false,
    allowCancel = true,
    showAddOns = true,
    onMergeUsage,
    onPaymentRequired,
    onSubscriptionChanged,
    onEntitlementsChanged,
    returnUrl,
  } = props;

  const client = useWildwood();
  const admin = useSubscriptionAdmin();
  const labels = useMemo(() => resolveLabels(labelOverrides), [labelOverrides]);
  const resolvedAppId = appId ?? client.config.appId ?? '';

  const [mergedLimitStatuses, setMergedLimitStatuses] = useState<AppTierLimitStatusModel[]>([]);
  const [lastCancelResult, setLastCancelResult] = useState<AppTierCancelResultModel | null>(null);
  const [pickingPacks, setPickingPacks] = useState(false);

  const visibleSections = useMemo(() => {
    const wanted = sections ?? ALL_SECTIONS;
    return wanted.filter((section) => {
      if (section === 'overrides') return isAdmin;
      if (section === 'addOns') return showAddOns;
      return true;
    });
  }, [sections, isAdmin, showAddOns]);

  const [activeTab, setActiveTab] = useState<ManageSection | null>(null);

  useEffect(() => {
    if (!resolvedAppId) return;
    admin
      .refreshAll(resolvedAppId, companyId, userId)
      .catch((err: unknown) => console.warn('Failed to load subscription data:', err));
  }, [resolvedAppId, companyId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The host's real-time usage, overlaid on the server's statuses after every refresh so an edit
  // stays in sync. Re-runs when the underlying data changes or the callback's inputs do.
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

  const refresh = useCallback(async () => {
    await admin.refreshAll(resolvedAppId, companyId, userId);
    onSubscriptionChanged?.();
  }, [admin, resolvedAppId, companyId, userId, onSubscriptionChanged]);

  const flow = usePlanChangeFlow({
    appId: resolvedAppId,
    userId,
    companyId,
    admin,
    onPaymentRequired,
    onChanged: refresh,
    onEntitlementsChanged,
    onError,
    labels,
  });

  // ── What the panels call ────────────────────────────────────────────────────

  const report = useCallback(
    (code: string, err: unknown, fallback: string) => {
      onError?.({ code, message: err instanceof Error && err.message ? err.message : fallback });
    },
    [onError],
  );

  const handleCancelSubscription = useCallback(async () => {
    let result: AppTierCancelResultModel;
    if (userId) {
      result = await admin.cancelUserSubscription(resolvedAppId, userId);
    } else if (companyId) {
      result = await admin.cancelCompanySubscription(resolvedAppId, companyId);
    } else {
      result = await admin.cancelSubscription(resolvedAppId);
    }
    setLastCancelResult(result);
    // A failed cancel must not look successful: the hook has already set admin.error.
    if (!result.success) {
      onError?.({
        code: 'subscription_cancel_failed',
        message: result.errorMessage ?? 'The subscription could not be cancelled.',
      });
      return;
    }
    await refresh();
  }, [admin, resolvedAppId, companyId, userId, refresh, onError]);

  /** Cancel a pack at the end of the period it is paid up to. A granted pack is simply removed. */
  const handlePackCancel = useCallback(
    async (subscriptionId: string) => {
      try {
        const result = await admin.cancelAddOnDetailed(subscriptionId, false);
        if (!result.success) {
          onError?.({
            code: result.errorCode ?? 'pack_cancel_failed',
            message: result.errorMessage ?? 'The pack could not be cancelled.',
          });
          return false;
        }
        await refresh();
        onEntitlementsChanged?.('cancel');
        return true;
      } catch (err) {
        report('pack_cancel_failed', err, 'The pack could not be cancelled.');
        return false;
      }
    },
    [admin, refresh, onEntitlementsChanged, onError, report],
  );

  const handlePackReactivate = useCallback(
    async (subscriptionId: string) => {
      try {
        const result = await admin.reactivateAddOn(subscriptionId);
        if (!result.success) {
          onError?.({
            code: result.errorCode ?? 'pack_reactivate_failed',
            message: result.errorMessage ?? 'The pack could not be reactivated.',
          });
          return false;
        }
        await refresh();
        onEntitlementsChanged?.('reactivate');
        return true;
      } catch (err) {
        report('pack_reactivate_failed', err, 'The pack could not be reactivated.');
        return false;
      }
    },
    [admin, refresh, onEntitlementsChanged, onError, report],
  );

  const handlePacksBought = useCallback(async () => {
    await refresh();
    onEntitlementsChanged?.('addOn');
  }, [refresh, onEntitlementsChanged]);

  const handleToggleFeature = useCallback(
    async (featureCode: string, isEnabled: boolean, reason?: string, expiresAt?: string) => {
      await admin.setFeatureOverride(resolvedAppId, userId ?? null, featureCode, isEnabled, reason, expiresAt);
      await refresh();
    },
    [admin, resolvedAppId, userId, refresh],
  );

  const handleRemoveOverride = useCallback(
    async (featureCode: string) => {
      await admin.removeFeatureOverride(resolvedAppId, featureCode, userId);
      await refresh();
    },
    [admin, resolvedAppId, userId, refresh],
  );

  const handleMakePermanent = useCallback(
    async (override: { featureCode: string; isEnabled: boolean; reason?: string }) => {
      await admin.setFeatureOverride(
        resolvedAppId,
        userId ?? null,
        override.featureCode,
        override.isEnabled,
        override.reason,
        undefined,
      );
      await refresh();
    },
    [admin, resolvedAppId, userId, refresh],
  );

  const handleUpdateLimit = useCallback(
    async (limitCode: string, newMaxValue: number) => {
      if (userId) await admin.updateUserUsageLimit(resolvedAppId, userId, limitCode, newMaxValue);
      else if (companyId) await admin.updateCompanyUsageLimit(resolvedAppId, companyId, limitCode, newMaxValue);
      else await admin.updateUsageLimit(resolvedAppId, limitCode, newMaxValue);
      await refresh();
    },
    [admin, resolvedAppId, companyId, userId, refresh],
  );

  const handleResetUsage = useCallback(
    async (limitCode: string) => {
      if (userId) await admin.resetUserUsage(resolvedAppId, userId, limitCode);
      else if (companyId) await admin.resetCompanyUsage(resolvedAppId, companyId, limitCode);
      else await admin.resetUsage(resolvedAppId, limitCode);
      await refresh();
    },
    [admin, resolvedAppId, companyId, userId, refresh],
  );

  if (!resolvedAppId) {
    return (
      <div className={['ww-regsub', 'ww-regsub-manage', className].filter(Boolean).join(' ')} data-ww-view="manage">
        <div className="ww-alert ww-alert-warning">An appId is required.</div>
      </div>
    );
  }

  // ── What the panels are given ───────────────────────────────────────────────

  // The catalog's own currency, unless the host overrode it. Never a guessed one.
  const resolvedCurrency = currency ?? admin.tiers.find((tier) => tier.currency)?.currency ?? 'USD';

  const mergedFeatures = admin.featureDefinitions.map((definition: AppFeatureDefinitionModel) => ({
    ...definition,
    isEnabled: admin.featureStatus[definition.featureCode] ?? false,
  }));

  /** Packs the account does not already have. A cancelled or expired row is on offer again. */
  const availablePacks = admin.addOns.filter(
    (addOn) =>
      !admin.addOnSubscriptions.some(
        (sub) => sub.appTierAddOnId?.toLowerCase() === addOn.id?.toLowerCase() && grantsAccess(sub.status),
      ),
  );

  const effectiveLimitStatuses = onMergeUsage
    ? mergedLimitStatuses.length > 0
      ? mergedLimitStatuses
      : admin.limitStatuses
    : admin.limitStatuses;

  const panels: Record<ManageSection, ReactNode> = {
    subscription: (
      <SubscriptionStatusPanel
        subscription={admin.subscription}
        loading={admin.loading}
        onCancelRequested={allowCancel ? handleCancelSubscription : undefined}
      />
    ),
    plans: (
      <TierPlansPanel
        tiers={admin.tiers}
        currentTierId={admin.subscription?.appTierId}
        loading={admin.loading}
        currency={resolvedCurrency}
        enterpriseContactUrl={contactUrl}
        onTierSelected={flow.selectTier}
      />
    ),
    features: (
      <FeaturesPanel
        features={mergedFeatures}
        featureOverrides={admin.featureOverrides}
        isAdmin={isAdmin}
        loading={admin.loading}
        includedLabel={labels.featureIncluded}
        onToggleFeature={isAdmin ? handleToggleFeature : undefined}
      />
    ),
    addOns: (
      <AddOnsPanel
        addOns={admin.addOns}
        subscriptions={admin.addOnSubscriptions}
        currentTierId={admin.subscription?.appTierId}
        loading={admin.loading}
        currency={resolvedCurrency}
        onCancel={allowCancel ? handlePackCancel : undefined}
        onReactivate={handlePackReactivate}
        onAddPacks={allowPackSelfService ? () => setPickingPacks(true) : undefined}
        labels={{
          included: labels.packIncluded,
          cancelIncluded: labels.packCancelIncluded,
          cancelBilled: labels.packCancelBilled,
          cancelConfirm: labels.packCancelConfirm,
          cancelKeep: labels.packCancelKeep,
          reactivate: labels.packReactivate,
          addPacks: labels.addPacks,
        }}
      />
    ),
    usage: (
      <UsageLimitsPanel
        limitStatuses={effectiveLimitStatuses}
        isAdmin={isAdmin}
        loading={admin.loading}
        onUpdateLimit={isAdmin ? handleUpdateLimit : undefined}
        onResetUsage={isAdmin ? handleResetUsage : undefined}
      />
    ),
    overrides: (
      <OverridesPanel
        overrides={admin.featureOverrides}
        loading={admin.loading}
        onRemoveOverride={handleRemoveOverride}
        onMakePermanent={handleMakePermanent}
      />
    ),
  };

  const sectionTitles: Record<ManageSection, string> = {
    subscription: labels.sectionStatus,
    plans: labels.sectionPlans,
    features: labels.sectionFeatures,
    addOns: labels.sectionPacks,
    usage: labels.sectionUsage,
    overrides: labels.sectionOverrides,
  };

  // The status card lifted above the tab bar is not also one of the sections below it.
  const statusAbove = showStatusAboveTabs && visibleSections.includes('subscription');
  const bodySections = visibleSections.filter((section) => !(statusAbove && section === 'subscription'));
  const currentTab = activeTab && bodySections.includes(activeTab) ? activeTab : bodySections[0];

  return (
    <div
      className={['ww-regsub', 'ww-regsub-manage', className].filter(Boolean).join(' ')}
      data-ww-view="manage"
      data-ww-step={flow.step}
    >
      {/* The flow's own notice carries a failed change's message, so the data layer's copy of it
          is not shown a second time. */}
      {admin.error && flow.step !== 'failed' && (
        <div className="ww-alert ww-alert-danger">
          {admin.error}
          <button type="button" className="ww-alert-dismiss" onClick={() => admin.clearError()}>
            &times;
          </button>
        </div>
      )}

      <PlanChangeNotice flow={flow} labels={labels} />
      <CancelResultNotice result={lastCancelResult} onDismiss={() => setLastCancelResult(null)} />

      {statusAbove && <div className="ww-sub-status-card">{panels.subscription}</div>}

      {layout === 'stacked' ? (
        <div className="ww-regsub-manage-sections">
          {bodySections.map((section) => (
            <section className="ww-regsub-manage-section" key={section} data-ww-section={section}>
              <h3 className="ww-regsub-manage-section-title">{sectionTitles[section]}</h3>
              {panels[section]}
            </section>
          ))}
        </div>
      ) : (
        <>
          <div className="ww-sub-admin-tabs">
            {bodySections.map((section) => (
              <button
                key={section}
                type="button"
                className={`ww-sub-admin-tab ${currentTab === section ? 'ww-sub-admin-tab-active' : ''}`}
                data-ww-section={section}
                onClick={() => setActiveTab(section)}
              >
                {sectionTitles[section]}
              </button>
            ))}
          </div>
          <div className="ww-sub-admin-content">{currentTab ? panels[currentTab] : null}</div>
        </>
      )}

      {/* Every layout confirms: a plan picked in a stacked layout previewed and then showed
          nothing when only the tabbed return carried the modal. */}
      {flow.preview && (
        <TierChangeConfirmationModal
          preview={flow.preview}
          onConfirm={flow.confirm}
          onCancel={flow.cancel}
          loading={flow.busy}
        />
      )}

      {flow.paymentRequest && (
        <PaymentModal
          appId={resolvedAppId}
          request={flow.paymentRequest}
          currency={resolvedCurrency}
          labels={labels}
          returnUrl={returnUrl}
          onSettled={flow.providePayment}
          onError={onError}
        />
      )}

      {pickingPacks && (
        <PackPicker
          appId={resolvedAppId}
          addOns={availablePacks}
          currency={resolvedCurrency}
          labels={labels}
          onFinished={handlePacksBought}
          onClose={() => setPickingPacks(false)}
          onError={onError}
        />
      )}
    </div>
  );
}
