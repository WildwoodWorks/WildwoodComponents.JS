// SubscriptionAdminComponent - the native twin of @wildwood/react's admin surface.
//
// The plan change itself is the shared `usePlanChangeFlow`, and the composition around it is the one
// `RegistrationSubscriptionManage` uses, so this component, the web admin component and the native
// manage view cannot drift: preview, confirm in every layout, collect a card when one is needed,
// change, answer the bank, complete.
//
// Where the card comes from follows one rule everywhere: a host `onPaymentRequired` wins when it was
// given, and otherwise the component's own `PaymentModal` takes it. That is the documented behaviour
// change the web made - before it, a change needing a card with no callback wired threw "Wire the
// onPaymentRequired callback" at the user.
//
// The 3-D Secure step is the host-injected `PaymentActionAdapter`, because this package ships no
// payment SDK. WITHOUT one the flow never tells the server it can answer a challenge, so the server
// refuses a change that needs one rather than parking it - and the card modal still works, since
// `PaymentComponent` completes a payment through the provider's own page or a server-owned
// completion with no SDK at all.

import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierCancelResultModel } from '@wildwood/core';
import { useSubscriptionAdmin } from '../../hooks/useSubscriptionAdmin';
import { usePaymentActionHandler } from '../../provider/PaymentActionContext';
import { SubscriptionStatusPanel } from './SubscriptionStatusPanel';
import { FeaturesPanel } from './FeaturesPanel';
import { AddOnsPanel } from './AddOnsPanel';
import { UsageLimitsPanel } from './UsageLimitsPanel';
import { OverridesPanel } from './OverridesPanel';
import { TierPlansPanel } from './TierPlansPanel';
import { TierChangeConfirmationModal } from './TierChangeConfirmationModal';
import { CancelResultNotice } from './CancelResultNotice';
import { PaymentModal } from '../registrationSubscription/parts/PaymentModal';
import { PlanChangeNotice } from '../registrationSubscription/parts/PlanChangeNotice';
import { planChangeCardSource } from '../registrationSubscription/views/manageViewModel';
import { usePlanChangeFlow, DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS } from '@wildwood/react-shared';
import type { PaymentActionAdapter, PaymentRequiredArgs } from '@wildwood/react-shared';

export type SubscriptionAdminDisplayMode = 'tabs' | 'subscription' | 'tiers' | 'features' | 'usage' | 'overrides';

// Declared in `@wildwood/react-shared` with the flows that hand it out, and re-exported from here
// (and from the payment seam) so existing imports keep resolving.
export type { PaymentRequiredArgs } from '@wildwood/react-shared';

export interface SubscriptionAdminComponentProps {
  appId: string;
  companyId?: string;
  userId?: string;
  isAdmin?: boolean;
  displayMode?: SubscriptionAdminDisplayMode;
  currency?: string;
  showBillingToggle?: boolean;
  showStatusAboveTabs?: boolean;
  /**
   * Collect the card for a change yourself. Given one, its answer is final - a transaction id
   * completes the change, an empty answer abandons it. Left out, the component's own
   * {@link import('../registrationSubscription/parts/PaymentModal').PaymentModal} takes the card.
   */
  onPaymentRequired?: (args: PaymentRequiredArgs) => Promise<string | null | undefined>;
  /**
   * How a card sheet or a bank's 3-D Secure challenge is shown on this device. Overrides
   * `WildwoodProvider`'s handler. Without one the server is never asked to park a change on a
   * challenge, because nothing here could answer it - see the README.
   */
  paymentActionHandler?: PaymentActionAdapter;
  onSubscriptionChanged?: () => void;
  style?: ViewStyle;
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
  paymentActionHandler,
  onSubscriptionChanged,
  style,
}: SubscriptionAdminComponentProps) {
  const admin = useSubscriptionAdmin();
  /* The host seam. A prop wins over the one WildwoodProvider supplies, and its ABSENCE is what keeps
     `SupportsPaymentAction` off the wire - the shared flow reads exactly this. */
  const handler = usePaymentActionHandler(paymentActionHandler);
  const [activeTab, setActiveTab] = useState<Tab>(showStatusAboveTabs ? 'tiers' : 'subscription');
  // Result of the most recent cancel action, shown as a dismissible notice near the status
  // panel (mirrors the Swift lastCancelResult card): scheduled vs immediate, plus store
  // instructions when the subscription is store-billed (requiresUserAction).
  const [lastCancelResult, setLastCancelResult] = useState<AppTierCancelResultModel | null>(null);

  useEffect(() => {
    if (appId) {
      admin.refreshAll(appId, companyId, userId);
    }
  }, [appId, companyId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(async () => {
    await admin.refreshAll(appId, companyId, userId);
    onSubscriptionChanged?.();
  }, [admin, appId, companyId, userId, onSubscriptionChanged]);

  // With a handler the change is posted in the options form (`SupportsPaymentAction`) so the server
  // may park it on a challenge this device can answer; without one it is posted plain, and a
  // challenge that arrives anyway is reported rather than swallowed (see the shared hook).
  const flow = usePlanChangeFlow({
    appId,
    userId,
    companyId,
    admin,
    onPaymentRequired,
    paymentActions: handler,
    onChanged: handleRefresh,
  });

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

  // Pack actions answer the panel with a boolean, so a refusal is SHOWN on the row instead of
  // looking as if the purchase went through. The self-service calls are the Detailed ones: they
  // carry the server's structured refusal (which the hook also puts on `admin.error`).
  const handleAddOnSubscribe = useCallback(
    async (addOnId: string, pricingId?: string) => {
      if (userId) {
        const ok = await admin.subscribeUserToAddOn(appId, userId, addOnId);
        if (!ok) return false;
      } else if (companyId) {
        const ok = await admin.subscribeCompanyToAddOn(appId, companyId, addOnId);
        if (!ok) return false;
      } else {
        const result = await admin.subscribeToAddOnDetailed(appId, addOnId, pricingId);
        if (!result.success) return false;
      }
      await handleRefresh();
      return true;
    },
    [admin, appId, companyId, userId, handleRefresh],
  );

  const handleAddOnCancel = useCallback(
    async (subscriptionId: string) => {
      if (userId) {
        const ok = await admin.cancelUserAddOn(appId, subscriptionId);
        if (!ok) return false;
      } else if (companyId) {
        const ok = await admin.cancelCompanyAddOn(subscriptionId);
        if (!ok) return false;
      } else {
        // End of the paid period, not immediately: the pack is paid up to it.
        const result = await admin.cancelAddOnDetailed(subscriptionId, false);
        if (!result.success) return false;
      }
      await handleRefresh();
      return true;
    },
    [admin, appId, companyId, userId, handleRefresh],
  );

  const handleAddOnReactivate = useCallback(
    async (subscriptionId: string) => {
      const result = await admin.reactivateAddOn(subscriptionId);
      if (!result.success) return false;
      await handleRefresh();
      return true;
    },
    [admin, handleRefresh],
  );

  const handleToggleFeature = useCallback(
    async (featureCode: string, isEnabled: boolean, reason?: string, expiresAt?: string) => {
      await admin.setFeatureOverride(appId, userId ?? null, featureCode, isEnabled, reason, expiresAt);
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
      await admin.setFeatureOverride(appId, userId ?? null, ov.featureCode, ov.isEnabled, ov.reason, undefined);
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
      <View style={styles.container}>
        <View style={styles.alertWarning}>
          <Text style={styles.alertWarningText}>AppId is required.</Text>
        </View>
      </View>
    );
  }

  const mergedFeatures = admin.featureDefinitions.map((def) => ({
    ...def,
    isEnabled: admin.featureStatus[def.featureCode] ?? false,
  }));

  const featuresContent = (
    <>
      <FeaturesPanel
        features={mergedFeatures}
        featureOverrides={admin.featureOverrides}
        isAdmin={isAdmin}
        loading={admin.loading}
        onToggleFeature={isAdmin ? handleToggleFeature : undefined}
      />
      <View style={{ height: 16 }} />
      <AddOnsPanel
        addOns={admin.addOns}
        subscriptions={admin.addOnSubscriptions}
        currentTierId={admin.subscription?.appTierId}
        loading={admin.loading}
        currency={currency}
        onSubscribe={handleAddOnSubscribe}
        onCancel={handleAddOnCancel}
        onReactivate={handleAddOnReactivate}
      />
    </>
  );

  const usageContent = (
    <UsageLimitsPanel
      limitStatuses={admin.limitStatuses}
      isAdmin={isAdmin}
      loading={admin.loading}
      onUpdateLimit={isAdmin ? handleUpdateLimit : undefined}
      onResetUsage={isAdmin ? handleResetUsage : undefined}
    />
  );

  // Dismissible cancel-result notice, rendered near the status panel. Only successful
  // cancels render here — a failed cancel surfaces through the admin.error alert.
  const cancelNotice = <CancelResultNotice result={lastCancelResult} onDismiss={() => setLastCancelResult(null)} />;

  const planChangeNotice = (
    <PlanChangeNotice flow={flow} labels={DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS} collectsPaymentInApp />
  );

  // Every layout renders the confirmation modal: a tier picked in a stacked layout previewed and
  // then showed nothing when only the tabbed return carried it.
  const confirmationModal = flow.preview ? (
    <TierChangeConfirmationModal
      preview={flow.preview}
      onConfirm={flow.confirm}
      onCancel={flow.cancel}
      loading={flow.busy}
    />
  ) : null;

  // The card, when the host did not bring a modal of its own. Rendered in every layout for the same
  // reason the confirmation is.
  const cardSource = planChangeCardSource({
    step: flow.step,
    hasHostHandler: !!onPaymentRequired,
    paymentRequest: flow.paymentRequest,
    collectsPaymentInApp: true,
  });
  const paymentModal =
    cardSource === 'builtIn' && flow.paymentRequest ? (
      <PaymentModal
        visible
        appId={appId}
        request={flow.paymentRequest}
        currency={currency}
        labels={DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS}
        paymentActionHandler={paymentActionHandler}
        onSettled={flow.providePayment}
      />
    ) : null;

  // A failed change speaks through the plan-change notice, not twice.
  const errorAlert =
    admin.error && flow.step !== 'failed' ? (
      <View style={styles.alertDanger}>
        <Text style={styles.alertDangerText}>{admin.error}</Text>
        <Pressable onPress={() => admin.clearError()}>
          <Text style={styles.alertDismiss}>{'✕'}</Text>
        </Pressable>
      </View>
    ) : null;

  const overridesContent = isAdmin ? (
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
      <ScrollView style={[styles.scroll, style]} contentContainerStyle={styles.scrollContent}>
        {errorAlert}
        {planChangeNotice}
        {cancelNotice}
        {displayMode === 'subscription' ? (
          <SubscriptionStatusPanel
            subscription={admin.subscription}
            loading={admin.loading}
            onCancelRequested={handleCancelSubscription}
          />
        ) : null}
        {displayMode === 'tiers' ? (
          <TierPlansPanel
            tiers={admin.tiers}
            currentTierId={admin.subscription?.appTierId}
            loading={admin.loading}
            showBillingToggle={showBillingToggle}
            currency={currency}
            onTierSelected={flow.selectTier}
          />
        ) : null}
        {displayMode === 'features' ? featuresContent : null}
        {displayMode === 'usage' ? usageContent : null}
        {displayMode === 'overrides' ? overridesContent : null}
        {confirmationModal}
        {paymentModal}
      </ScrollView>
    );
  }

  // Tabbed mode
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
    <ScrollView style={[styles.scroll, style]} contentContainerStyle={styles.scrollContent}>
      {errorAlert}

      {planChangeNotice}

      {cancelNotice}

      {showStatusAboveTabs ? (
        <View style={styles.statusAbove}>
          <SubscriptionStatusPanel
            subscription={admin.subscription}
            loading={admin.loading}
            onCancelRequested={handleCancelSubscription}
          />
        </View>
      ) : null}

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Tab content */}
      <View style={styles.tabContent}>
        {activeTab === 'subscription' && !showStatusAboveTabs ? (
          <SubscriptionStatusPanel
            subscription={admin.subscription}
            loading={admin.loading}
            onCancelRequested={handleCancelSubscription}
          />
        ) : null}
        {activeTab === 'tiers' ? (
          <TierPlansPanel
            tiers={admin.tiers}
            currentTierId={admin.subscription?.appTierId}
            loading={admin.loading}
            showBillingToggle={showBillingToggle}
            currency={currency}
            onTierSelected={flow.selectTier}
          />
        ) : null}
        {activeTab === 'features' ? featuresContent : null}
        {activeTab === 'usage' ? usageContent : null}
        {activeTab === 'overrides' ? overridesContent : null}
      </View>

      {confirmationModal}
      {paymentModal}
    </ScrollView>
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
    shadowOpacity: 0.06,
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
});
