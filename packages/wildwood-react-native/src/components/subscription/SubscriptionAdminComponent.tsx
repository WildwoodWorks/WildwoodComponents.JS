import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useSubscriptionAdmin } from '../../hooks/useSubscriptionAdmin';
import { SubscriptionStatusPanel } from './SubscriptionStatusPanel';
import { FeaturesPanel } from './FeaturesPanel';
import { AddOnsPanel } from './AddOnsPanel';
import { UsageLimitsPanel } from './UsageLimitsPanel';
import { AppTierComponent } from '../AppTierComponent';

export type SubscriptionAdminDisplayMode = 'tabs' | 'subscription' | 'tiers' | 'features' | 'usage';

export interface SubscriptionAdminComponentProps {
  appId: string;
  companyId?: string;
  displayMode?: SubscriptionAdminDisplayMode;
  selfService?: boolean;
  currency?: string;
  showBillingToggle?: boolean;
  showStatusAboveTabs?: boolean;
  onSubscriptionChanged?: () => void;
  style?: ViewStyle;
}

type Tab = 'subscription' | 'tiers' | 'features' | 'usage';

export function SubscriptionAdminComponent({
  appId,
  companyId,
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
    async (tierId: string, pricingId?: string) => {
      if (companyId) {
        await admin.subscribeCompanyToTier(appId, companyId, tierId, pricingId);
      } else if (selfService) {
        await admin.selfSubscribeTo(appId, tierId, pricingId);
      } else {
        await admin.subscribeTo(appId, tierId, pricingId);
      }
      await handleRefresh();
    },
    [admin, appId, companyId, selfService, handleRefresh],
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
        {displayMode === 'features' ? (
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
        ) : null}
        {displayMode === 'usage' ? (
          <UsageLimitsPanel limitStatuses={admin.limitStatuses} loading={admin.loading} />
        ) : null}
      </ScrollView>
    );
  }

  // Tabbed mode
  const tabs: { key: Tab; label: string }[] = showStatusAboveTabs
    ? [
        { key: 'tiers', label: 'Plans' },
        { key: 'features', label: 'Features & Add-Ons' },
        { key: 'usage', label: 'Usage' },
      ]
    : [
        { key: 'subscription', label: 'Subscription' },
        { key: 'tiers', label: 'Plans' },
        { key: 'features', label: 'Features & Add-Ons' },
        { key: 'usage', label: 'Usage' },
      ];

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
        {activeTab === 'features' ? (
          <>
            <FeaturesPanel features={mergedFeatures} loading={admin.loading} />
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
        ) : null}
        {activeTab === 'usage' ? (
          <UsageLimitsPanel limitStatuses={admin.limitStatuses} loading={admin.loading} />
        ) : null}
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
