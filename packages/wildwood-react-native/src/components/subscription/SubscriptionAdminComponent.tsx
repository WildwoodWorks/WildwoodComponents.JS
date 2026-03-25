import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useSubscriptionAdmin } from '../../hooks/useSubscriptionAdmin';
import { SubscriptionStatusPanel } from './SubscriptionStatusPanel';
import { FeaturesPanel } from './FeaturesPanel';
import { AddOnsPanel } from './AddOnsPanel';
import { UsageLimitsPanel } from './UsageLimitsPanel';
import { OverridesPanel } from './OverridesPanel';
import { AppTierComponent } from '../AppTierComponent';

export type SubscriptionAdminDisplayMode = 'tabs' | 'subscription' | 'tiers' | 'features' | 'usage' | 'overrides';

export interface SubscriptionAdminComponentProps {
  appId: string;
  companyId?: string;
  userId?: string;
  isAdmin?: boolean;
  displayMode?: SubscriptionAdminDisplayMode;
  selfService?: boolean;
  currency?: string;
  showBillingToggle?: boolean;
  showStatusAboveTabs?: boolean;
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
  selfService = false,
  currency = 'USD',
  showBillingToggle = true,
  showStatusAboveTabs = false,
  onSubscriptionChanged,
  style,
}: SubscriptionAdminComponentProps) {
  const admin = useSubscriptionAdmin();
  const [activeTab, setActiveTab] = useState<Tab>(showStatusAboveTabs ? 'tiers' : 'subscription');

  useEffect(() => {
    if (appId) {
      admin.refreshAll(appId, companyId, userId);
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
    async (tierId: string, pricingId?: string) => {
      if (userId) {
        await admin.subscribeUserToTier(appId, userId, tierId, pricingId);
      } else if (companyId) {
        await admin.subscribeCompanyToTier(appId, companyId, tierId, pricingId);
      } else if (selfService) {
        await admin.selfSubscribeTo(appId, tierId, pricingId);
      } else {
        await admin.subscribeTo(appId, tierId, pricingId);
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
        {admin.error ? (
          <View style={styles.alertDanger}>
            <Text style={styles.alertDangerText}>{admin.error}</Text>
            <Pressable onPress={() => admin.clearError()}>
              <Text style={styles.alertDismiss}>{'\u2715'}</Text>
            </Pressable>
          </View>
        ) : null}
        {displayMode === 'subscription' ? (
          <SubscriptionStatusPanel
            subscription={admin.subscription}
            loading={admin.loading}
            onCancelRequested={handleCancelSubscription}
          />
        ) : null}
        {displayMode === 'tiers' ? (
          <AppTierComponent
            showBillingToggle={showBillingToggle}
            onTierChanged={(tierId) => handleTierSelected(tierId)}
          />
        ) : null}
        {displayMode === 'features' ? featuresContent : null}
        {displayMode === 'usage' ? usageContent : null}
        {displayMode === 'overrides' ? overridesContent : null}
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
      {admin.error ? (
        <View style={styles.alertDanger}>
          <Text style={styles.alertDangerText}>{admin.error}</Text>
          <Pressable onPress={() => admin.clearError()}>
            <Text style={styles.alertDismiss}>{'\u2715'}</Text>
          </Pressable>
        </View>
      ) : null}

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
          <AppTierComponent
            showBillingToggle={showBillingToggle}
            onTierChanged={(tierId) => handleTierSelected(tierId)}
          />
        ) : null}
        {activeTab === 'features' ? featuresContent : null}
        {activeTab === 'usage' ? usageContent : null}
        {activeTab === 'overrides' ? overridesContent : null}
      </View>
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
