import { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierModel } from '@wildwood/core';
import { hasAnnualPricing, getSelectedPricing } from '@wildwood/core';
import { TierCard } from '../tier/TierCard';

export interface TierSelectedEventArgs {
  tierId: string;
  tierName: string;
  pricingId?: string;
  price?: number;
  isFreeTier: boolean;
  isChange: boolean;
}

export interface TierPlansPanelProps {
  tiers: AppTierModel[];
  currentTierId?: string;
  loading?: boolean;
  showBillingToggle?: boolean;
  currency?: string;
  enterpriseContactUrl?: string;
  onTierSelected?: (args: TierSelectedEventArgs) => void;
  style?: ViewStyle;
}

export function TierPlansPanel({
  tiers,
  currentTierId,
  loading,
  showBillingToggle = true,
  currency = 'USD',
  enterpriseContactUrl,
  onTierSelected,
  style,
}: TierPlansPanelProps) {
  const [billingAnnual, setBillingAnnual] = useState(false);
  const [processingTierId, setProcessingTierId] = useState<string | null>(null);

  const hasAnnual = hasAnnualPricing(tiers);

  const handleSelect = useCallback(
    async (tier: AppTierModel) => {
      const pricing = getSelectedPricing(tier, billingAnnual);
      setProcessingTierId(tier.id);
      try {
        onTierSelected?.({
          tierId: tier.id,
          tierName: tier.name,
          pricingId: pricing?.id,
          price: pricing?.price,
          isFreeTier: tier.isFreeTier,
          isChange: !!currentTierId && currentTierId !== tier.id,
        });
      } finally {
        setProcessingTierId(null);
      }
    },
    [billingAnnual, currentTierId, onTierSelected],
  );

  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading plans...</Text>
      </View>
    );
  }

  if (!tiers.length) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.alertInfo}>
          <Text style={styles.alertInfoText}>No plans available.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {showBillingToggle && hasAnnual ? (
        <View style={styles.billingToggle}>
          <Text style={[styles.billingLabel, !billingAnnual && styles.billingLabelActive]}>Monthly</Text>
          <Pressable
            style={[styles.toggleTrack, billingAnnual && styles.toggleTrackOn]}
            onPress={() => setBillingAnnual(!billingAnnual)}
            accessibilityLabel="Toggle annual billing"
            accessibilityRole="switch"
          >
            <View style={[styles.toggleThumb, billingAnnual && styles.toggleThumbOn]} />
          </Pressable>
          <Text style={[styles.billingLabel, billingAnnual && styles.billingLabelActive]}>Annual</Text>
        </View>
      ) : null}

      <View style={styles.grid}>
        {tiers.map((tier) => {
          const isCurrent = currentTierId === tier.id;
          const pricing = getSelectedPricing(tier, billingAnnual);

          return (
            <TierCard
              key={tier.id}
              tier={tier}
              pricing={pricing}
              currency={currency}
              isCurrent={isCurrent}
              enterpriseContactUrl={enterpriseContactUrl}
              disabled={processingTierId === tier.id}
              processingText={processingTierId === tier.id ? 'Processing...' : undefined}
              onSelect={handleSelect}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  loadingText: { marginTop: 8, fontSize: 14, color: '#666', textAlign: 'center' },
  alertInfo: { backgroundColor: '#DBEAFE', borderRadius: 8, padding: 12 },
  alertInfoText: { color: '#1D4ED8', fontSize: 14 },
  billingToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  billingLabel: { fontSize: 14, fontWeight: '500', color: '#999' },
  billingLabelActive: { color: '#1a1a1a', fontWeight: '600' },
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ddd',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleTrackOn: { backgroundColor: '#007AFF' },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbOn: { alignSelf: 'flex-end' },
  grid: { gap: 16 },
});
