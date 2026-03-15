import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierAddOnModel, UserAddOnSubscriptionModel } from '@wildwood/core';
import { formatPrice } from '@wildwood/core';

export interface AddOnsPanelProps {
  addOns: AppTierAddOnModel[];
  subscriptions: UserAddOnSubscriptionModel[];
  currentTierId?: string;
  loading?: boolean;
  currency?: string;
  onSubscribe?: (addOnId: string, pricingId?: string) => Promise<void>;
  onCancel?: (subscriptionId: string) => Promise<void>;
  style?: ViewStyle;
}

export function AddOnsPanel({
  addOns,
  subscriptions,
  currentTierId,
  loading,
  currency = 'USD',
  onSubscribe,
  onCancel,
  style,
}: AddOnsPanelProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);

  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const isSubscribed = (addOnId: string) =>
    subscriptions.some((s) => s.appTierAddOnId === addOnId && s.status === 'Active');

  const isBundled = (addOn: AppTierAddOnModel) =>
    currentTierId ? addOn.bundledInTierIds?.includes(currentTierId) : false;

  const getSubscription = (addOnId: string) => subscriptions.find((s) => s.appTierAddOnId === addOnId);

  const handleSubscribe = async (addOnId: string, pricingId?: string) => {
    setProcessingId(addOnId);
    try {
      await onSubscribe?.(addOnId, pricingId);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (subscriptionId: string) => {
    setProcessingId(subscriptionId);
    try {
      await onCancel?.(subscriptionId);
    } finally {
      setProcessingId(null);
    }
  };

  const activeAddOns = subscriptions.filter((s) => s.status === 'Active' || s.status === 'Trialing');
  const availableAddOns = addOns.filter((a) => !isSubscribed(a.id));

  return (
    <View style={[styles.container, style]}>
      {/* Active */}
      {activeAddOns.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Add-Ons</Text>
          <View style={styles.grid}>
            {activeAddOns.map((sub) => (
              <View key={sub.id} style={[styles.card, styles.cardActive]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardName}>{sub.addOnName}</Text>
                  <View style={[styles.badge, sub.isBundled ? styles.badgeInfo : styles.badgeSuccess]}>
                    <Text style={[styles.badgeText, sub.isBundled ? styles.badgeInfoText : styles.badgeSuccessText]}>
                      {sub.isBundled ? 'Bundled' : sub.status}
                    </Text>
                  </View>
                </View>
                {sub.addOnDescription ? <Text style={styles.mutedText}>{sub.addOnDescription}</Text> : null}
                <Text style={styles.dateText}>
                  Started: {new Date(sub.startDate).toLocaleDateString()}
                  {sub.endDate ? ` | Renews: ${new Date(sub.endDate).toLocaleDateString()}` : ''}
                </Text>
                {!sub.isBundled && onCancel ? (
                  <Pressable
                    style={[styles.cancelBtn, processingId === sub.id && styles.buttonDisabled]}
                    onPress={() => handleCancel(sub.id)}
                    disabled={processingId === sub.id}
                  >
                    <Text style={styles.cancelBtnText}>{processingId === sub.id ? 'Cancelling...' : 'Cancel'}</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Available */}
      {availableAddOns.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Add-Ons</Text>
          <View style={styles.grid}>
            {availableAddOns.map((addOn) => {
              const bundled = isBundled(addOn);
              const pricing = addOn.pricingOptions?.find((p) => p.isDefault) ?? addOn.pricingOptions?.[0];
              const sub = getSubscription(addOn.id);

              return (
                <View key={addOn.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardName}>{addOn.name}</Text>
                    {addOn.category ? (
                      <View style={[styles.badge, styles.badgeSecondary]}>
                        <Text style={[styles.badgeText, styles.badgeSecondaryText]}>{addOn.category}</Text>
                      </View>
                    ) : null}
                  </View>
                  {addOn.description ? <Text style={styles.mutedText}>{addOn.description}</Text> : null}
                  {addOn.features?.length > 0 ? (
                    <View style={styles.featuresList}>
                      {addOn.features.map((f) => (
                        <View key={f.id} style={styles.featureRow}>
                          <Text style={styles.featureCheck}>{'\u2713'}</Text>
                          <Text style={styles.featureName}>{f.displayName}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {pricing ? (
                    <Text style={styles.priceText}>
                      {formatPrice(pricing.price, currency)}/{pricing.billingFrequency?.toLowerCase() ?? 'month'}
                    </Text>
                  ) : null}
                  {addOn.trialDays && addOn.trialDays > 0 ? (
                    <Text style={styles.trialText}>{addOn.trialDays}-day free trial</Text>
                  ) : null}
                  <View style={styles.cardFooter}>
                    {bundled ? (
                      <View style={[styles.badge, styles.badgeInfo]}>
                        <Text style={[styles.badgeText, styles.badgeInfoText]}>Included in Plan</Text>
                      </View>
                    ) : sub ? (
                      <View style={[styles.badge, styles.badgeSuccess]}>
                        <Text style={[styles.badgeText, styles.badgeSuccessText]}>Subscribed</Text>
                      </View>
                    ) : (
                      <Pressable
                        style={[styles.subscribeBtn, processingId === addOn.id && styles.buttonDisabled]}
                        onPress={() => handleSubscribe(addOn.id, pricing?.id)}
                        disabled={processingId === addOn.id}
                      >
                        <Text style={styles.subscribeBtnText}>
                          {processingId === addOn.id ? 'Subscribing...' : 'Subscribe'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {!activeAddOns.length && !availableAddOns.length ? (
        <View style={styles.alertInfo}>
          <Text style={styles.alertInfoText}>No add-ons available.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  loadingText: { marginTop: 8, fontSize: 14, color: '#666', textAlign: 'center' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  grid: { gap: 10 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
    gap: 8,
  },
  cardActive: { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', flex: 1 },
  mutedText: { fontSize: 13, color: '#666' },
  dateText: { fontSize: 12, color: '#999' },
  featuresList: { gap: 4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  featureCheck: { color: '#22C55E', fontSize: 14, fontWeight: '700' },
  featureName: { fontSize: 13, color: '#333' },
  priceText: { fontSize: 15, fontWeight: '700', color: '#007AFF' },
  trialText: { fontSize: 12, color: '#999' },
  cardFooter: { marginTop: 4 },
  badge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeSuccess: { backgroundColor: '#DCFCE7' },
  badgeSuccessText: { color: '#166534' },
  badgeInfo: { backgroundColor: '#DBEAFE' },
  badgeInfoText: { color: '#1D4ED8' },
  badgeSecondary: { backgroundColor: '#F3F4F6' },
  badgeSecondaryText: { color: '#6B7280' },
  cancelBtn: {
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  cancelBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },
  subscribeBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  subscribeBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
  alertInfo: { backgroundColor: '#DBEAFE', borderRadius: 8, padding: 12 },
  alertInfoText: { color: '#1D4ED8', fontSize: 14 },
});
