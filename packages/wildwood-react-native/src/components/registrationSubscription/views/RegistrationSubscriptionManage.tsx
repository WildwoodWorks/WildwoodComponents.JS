// The manage view: what a customer already pays for, and every way of changing it.
//
// The panels are this package's own - the same status card, plan grid, features, packs, usage and
// overrides `SubscriptionAdminComponent` has always rendered - so an app swapping its hand-built
// subscription screen for this keeps its locators. What is new is the middle: the plan change runs
// through the shared `usePlanChangeFlow`, so a preview is confirmed in EVERY layout, a card is asked
// for by the component itself when the host did not bring its own sheet, and a prorated charge the
// bank wants to see is authenticated and the parked change completed instead of being refused.
//
// Two things are native rather than copied from the web, and both are the platform talking:
//
//  · This package ships no payment SDK, so the 3-D Secure step is the host-injected
//    `PaymentActionAdapter`. WITHOUT one the flow is never told this device can answer a challenge,
//    so the server refuses a change that needs one instead of parking it - and the card modal still
//    works, because `PaymentComponent` completes a payment through the provider's own page or a
//    server-owned completion with no SDK at all.
//  · A store-billed device (`requiresAppStorePayment`) has no store product behind a pack, so pack
//    PURCHASE is not offered; owned, bundled and granted rows still render and can still be
//    cancelled. The confirmation drops the server's proration figures for the same reason: the store
//    prices its own subscriptions, and quoting a charge nobody here can honour is worse than saying
//    who bills it.
//
// Packs are the other half. A pack is bought through the same card-once checkout the signup uses,
// cancelled at the end of the period it is paid up to, and a scheduled cancellation can be taken
// back. A pack nobody paid for - a registration token's, an admin's - says so, shows no renewal date
// and is simply removed when it is cancelled.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { AppTierCancelResultModel, AppTierLimitStatusModel } from '@wildwood/core';
import { buildPublicCatalog } from '@wildwood/core';
import { resolveRegistrationSubscriptionLabels, usePlanChangeFlow } from '@wildwood/react-shared';
import { useSubscriptionAdmin } from '../../../hooks/useSubscriptionAdmin';
import { useWildwood } from '../../../hooks/useWildwood';
import { usePaymentActionHandler } from '../../../provider/PaymentActionContext';
import { AddOnsPanel } from '../../subscription/AddOnsPanel';
import { CancelResultNotice } from '../../subscription/CancelResultNotice';
import { FeaturesPanel } from '../../subscription/FeaturesPanel';
import { OverridesPanel } from '../../subscription/OverridesPanel';
import { SubscriptionStatusPanel } from '../../subscription/SubscriptionStatusPanel';
import { TierChangeConfirmationModal } from '../../subscription/TierChangeConfirmationModal';
import { TierPlansPanel } from '../../subscription/TierPlansPanel';
import { UsageLimitsPanel } from '../../subscription/UsageLimitsPanel';
import { PackPicker } from '../parts/PackPicker';
import { PaymentModal } from '../parts/PaymentModal';
import { PlanChangeNotice } from '../parts/PlanChangeNotice';
import { wwViewTestIds } from '../testIds';
import type { ManageSection, RegistrationSubscriptionManageProps } from '../types';
import {
  availablePacks,
  currentManageTab,
  effectiveLimitStatuses,
  isTabbedLayout,
  manageBodyLayout,
  manageCurrency,
  manageSectionTitle,
  packSelfServiceOffered,
  planChangeCardSource,
  showsProration,
  visibleManageSections,
} from './manageViewModel';

export function RegistrationSubscriptionManage(props: RegistrationSubscriptionManageProps) {
  const {
    appId,
    currency,
    contactUrl,
    labels: labelOverrides,
    onError,
    style,
    testID,
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
    paymentActionHandler,
    onSubscriptionChanged,
    onEntitlementsChanged,
  } = props;

  const client = useWildwood();
  const admin = useSubscriptionAdmin();
  const labels = useMemo(() => resolveRegistrationSubscriptionLabels(labelOverrides), [labelOverrides]);
  const resolvedAppId = appId ?? client.config.appId ?? '';

  /* The host seam. A prop wins over the one WildwoodProvider supplies, and its ABSENCE is what keeps
     `SupportsPaymentAction` off the wire - the shared flow reads exactly this. */
  const handler = usePaymentActionHandler(paymentActionHandler);

  const [mergedLimitStatuses, setMergedLimitStatuses] = useState<AppTierLimitStatusModel[]>([]);
  const [lastCancelResult, setLastCancelResult] = useState<AppTierCancelResultModel | null>(null);
  const [pickingPacks, setPickingPacks] = useState(false);
  const [activeTab, setActiveTab] = useState<ManageSection | null>(null);

  /* Whether this device has to pay through its store. The server answers per platform, so it is
     asked rather than guessed, and an unanswerable question is read as "no": hiding the card path
     because a lookup failed would be worse than offering the one the app is configured for. */
  const [storeOnly, setStoreOnly] = useState(false);
  useEffect(() => {
    if (!resolvedAppId) return undefined;
    let live = true;
    void client.payment
      .getAvailableProviders(resolvedAppId)
      .then((providers) => {
        if (live) setStoreOnly(providers?.requiresAppStorePayment === true);
      })
      .catch(() => {
        /* Not answerable: the card path the app is configured for stands. */
      });
    return () => {
      live = false;
    };
  }, [client, resolvedAppId]);

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
    // Present only when something on this device can put a bank's challenge in front of the
    // customer. The shared flow sends `SupportsPaymentAction` on exactly this condition.
    paymentActions: handler,
    onChanged: refresh,
    onEntitlementsChanged,
    onError,
    labels,
  });

  /* The host's id, the plan change's step and the view's name, on three elements rather than one -
     see `wwViewTestIds`. Built before the early return below so that frame names itself too. */
  const ids = wwViewTestIds('manage', testID, flow.step === 'idle' ? '' : flow.step);

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

  // The packs the picker orders a selection by. Built from the data the panels already show, so the
  // sheet and the panel behind it cannot disagree about what the app sells.
  const catalog = useMemo(
    () =>
      buildPublicCatalog({
        appId: resolvedAppId,
        tiers: admin.tiers,
        addOns: admin.addOns,
        currencyOverride: currency,
      }),
    [resolvedAppId, admin.tiers, admin.addOns, currency],
  );

  if (!resolvedAppId) {
    // Nothing can run without an app, so there is no step to report: the notice itself carries the
    // view's name, and a test looking for `manage` finds this frame as readily as the live one.
    return (
      <View style={[styles.container, style]} testID={ids.host}>
        <View style={styles.alertWarning} testID={ids.view}>
          <Text style={styles.alertWarningText}>An appId is required.</Text>
        </View>
      </View>
    );
  }

  // ── What the panels are given ───────────────────────────────────────────────

  const resolvedCurrency = manageCurrency(currency, admin.tiers);
  const packSelfService = packSelfServiceOffered({ allowPackSelfService, showAddOns, storeOnly });
  const cardSource = planChangeCardSource({
    step: flow.step,
    hasHostHandler: !!onPaymentRequired,
    paymentRequest: flow.paymentRequest,
    // This surface mounts `PaymentModal`, so the notice never has to speak for the card step.
    collectsPaymentInApp: true,
  });

  const mergedFeatures = admin.featureDefinitions.map((definition) => ({
    ...definition,
    isEnabled: admin.featureStatus[definition.featureCode] ?? false,
  }));

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
        onAddPacks={packSelfService ? () => setPickingPacks(true) : undefined}
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
        limitStatuses={effectiveLimitStatuses(mergedLimitStatuses, admin.limitStatuses, !!onMergeUsage)}
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

  const visible = visibleManageSections({ sections, isAdmin, showAddOns });
  const { statusAbove, body } = manageBodyLayout(visible, showStatusAboveTabs);
  const currentTab = currentManageTab(activeTab, body);

  /* The host's style stays on the outermost element, which is what it sized and coloured before the
     frame grew: the scroller inside it fills it. The view's name is on the scroller and the plan
     change's step beneath it, so the two strings the web keeps in `data-ww-view` and `data-ww-step`
     are both on screen at once rather than taking turns, nested the same way round as the web's:
     `within(getByTestId('manage'))` scopes a step read, which bare ids like `failed` need on a
     screen holding more than one Wildwood surface. */
  return (
    <View style={[styles.scroll, style]} testID={ids.host}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} testID={ids.view}>
        <View testID={ids.step}>
          {/* The flow's own notice carries a failed change's message, so the data layer's copy of it
              is not shown a second time. */}
          {admin.error && flow.step !== 'failed' ? (
            <View style={styles.alertDanger}>
              <Text style={styles.alertDangerText}>{admin.error}</Text>
              <Pressable
                onPress={() => admin.clearError()}
                accessibilityRole="button"
                accessibilityLabel={labels.cancel}
              >
                <Text style={styles.alertDismiss}>{'✕'}</Text>
              </Pressable>
            </View>
          ) : null}

          <PlanChangeNotice flow={flow} labels={labels} collectsPaymentInApp />
          <CancelResultNotice result={lastCancelResult} onDismiss={() => setLastCancelResult(null)} />

          {statusAbove ? <View style={styles.statusAbove}>{panels.subscription}</View> : null}

          {isTabbedLayout(layout) ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
                {body.map((section) => (
                  <Pressable
                    key={section}
                    style={[styles.tab, currentTab === section && styles.tabActive]}
                    onPress={() => setActiveTab(section)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: currentTab === section }}
                    testID={`section:${section}`}
                  >
                    <Text style={[styles.tabText, currentTab === section && styles.tabTextActive]}>
                      {manageSectionTitle(section, labels)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.tabContent}>{currentTab ? panels[currentTab] : null}</View>
            </>
          ) : (
            <View style={styles.sections}>
              {body.map((section) => (
                <View key={section} style={styles.section} testID={`section:${section}`}>
                  <Text style={styles.sectionTitle}>{manageSectionTitle(section, labels)}</Text>
                  {panels[section]}
                </View>
              ))}
            </View>
          )}

          {/* Every layout confirms: a plan picked in a stacked layout previewed and then showed
              nothing when only the tabbed return carried the modal. */}
          {flow.preview ? (
            <TierChangeConfirmationModal
              preview={flow.preview}
              onConfirm={flow.confirm}
              onCancel={flow.cancel}
              loading={flow.busy}
              storeBilled={!showsProration(storeOnly)}
              storeNotice={labels.storeManagesBilling}
            />
          ) : null}

          {cardSource === 'builtIn' && flow.paymentRequest ? (
            <PaymentModal
              visible
              appId={resolvedAppId}
              request={flow.paymentRequest}
              currency={resolvedCurrency}
              labels={labels}
              paymentActionHandler={paymentActionHandler}
              onSettled={flow.providePayment}
              onError={onError}
            />
          ) : null}

          {pickingPacks ? (
            <PackPicker
              visible
              appId={resolvedAppId}
              addOns={availablePacks(admin.addOns, admin.addOnSubscriptions)}
              catalog={catalog}
              currency={resolvedCurrency}
              labels={labels}
              paymentActionHandler={paymentActionHandler}
              onBought={handlePacksBought}
              onError={onError}
              onClose={() => setPickingPacks(false)}
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  alertWarning: { backgroundColor: '#FEF3C7', borderRadius: 8, padding: 12 },
  alertWarningText: { color: '#92400E', fontSize: 14 },
  alertDanger: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertDangerText: { color: '#991B1B', fontSize: 14, flex: 1 },
  alertDismiss: { color: '#991B1B', fontSize: 18, paddingLeft: 8 },
  statusAbove: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    // Kept to one decimal: the dynamic-pricing guard greps this directory for a two-decimal
    // number, and a shadow is not worth teaching it an exception for.
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabBar: { marginBottom: 16, flexGrow: 0 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginRight: 4,
  },
  tabActive: { borderBottomColor: '#007AFF' },
  tabText: { fontSize: 14, fontWeight: '500', color: '#999' },
  tabTextActive: { color: '#007AFF', fontWeight: '600' },
  tabContent: { minHeight: 200 },
  sections: { gap: 24 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
});
