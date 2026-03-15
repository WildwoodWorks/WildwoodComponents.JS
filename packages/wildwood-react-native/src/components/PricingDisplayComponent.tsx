import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierModel, AppTierPricingModel } from '@wildwood/core';
import {
  formatPrice,
  isEnterpriseTier,
  hasAnnualPricing,
  getSelectedPricing,
  computeAnnualDiscount,
} from '@wildwood/core';
import { useWildwood } from '../hooks/useWildwood';

export interface PricingDisplayComponentProps {
  appId?: string;
  title?: string;
  subtitle?: string;
  showBillingToggle?: boolean;
  showFeatureComparison?: boolean;
  showLimits?: boolean;
  currency?: string;
  enterpriseContactUrl?: string;
  preSelectedTierId?: string;
  onSelectTier?: (tier: AppTierModel, pricing: AppTierPricingModel | null) => void;
  preloadedTiers?: AppTierModel[];
  style?: ViewStyle;
}

export function PricingDisplayComponent({
  appId,
  title,
  subtitle,
  showBillingToggle = true,
  showFeatureComparison = true,
  showLimits = true,
  currency = 'USD',
  enterpriseContactUrl,
  preSelectedTierId,
  onSelectTier,
  preloadedTiers,
  style,
}: PricingDisplayComponentProps) {
  const client = useWildwood();
  const resolvedAppId = appId ?? client.config.appId ?? '';

  const [tiers, setTiers] = useState<AppTierModel[]>(preloadedTiers ?? []);
  const [loading, setLoading] = useState(!preloadedTiers);
  const [error, setError] = useState<string | null>(null);
  const [billingAnnual, setBillingAnnual] = useState(false);

  const showToggle = showBillingToggle && hasAnnualPricing(tiers);

  const maxDiscount = useMemo(() => {
    let max = 0;
    for (const t of tiers) {
      const d = computeAnnualDiscount(t);
      if (d && d > max) max = d;
    }
    return max;
  }, [tiers]);

  useEffect(() => {
    if (preloadedTiers) {
      setTiers(preloadedTiers);
      setLoading(false);
      return;
    }
    if (!resolvedAppId) {
      setError('No appId provided');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    client.appTier
      .getPublicTiers(resolvedAppId)
      .then(setTiers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load pricing'))
      .finally(() => setLoading(false));
  }, [resolvedAppId, preloadedTiers, client.appTier]);

  const handleSelect = useCallback(
    (tier: AppTierModel) => {
      const pricing = getSelectedPricing(tier, billingAnnual) ?? null;
      onSelectTier?.(tier, pricing);
    },
    [billingAnnual, onSelectTier],
  );

  return (
    <ScrollView style={[styles.container, style]} contentContainerStyle={styles.content}>
      {title || subtitle ? (
        <View style={styles.header}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}

      {error ? (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{error}</Text>
        </View>
      ) : null}

      {showToggle ? (
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
          <View style={styles.billingAnnualGroup}>
            <Text style={[styles.billingLabel, billingAnnual && styles.billingLabelActive]}>Annual</Text>
            {maxDiscount > 0 ? (
              <View style={styles.discountBadge}>
                <Text style={styles.discountBadgeText}>Save up to {maxDiscount}%</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading plans...</Text>
        </View>
      ) : (
        <View style={styles.tierGrid}>
          {tiers.map((tier) => {
            const pricing = getSelectedPricing(tier, billingAnnual);
            const discount = billingAnnual ? computeAnnualDiscount(tier) : null;
            const enterprise = isEnterpriseTier(tier);
            const isPreSelected = preSelectedTierId === tier.id;

            return (
              <View key={tier.id} style={[styles.tierCard, isPreSelected && styles.tierCardPreSelected]}>
                {isPreSelected ? (
                  <View style={styles.preSelectedBadge}>
                    <Text style={styles.preSelectedBadgeText}>Your Selection</Text>
                  </View>
                ) : tier.customBadgeText ? (
                  <View style={styles.customBadge}>
                    <Text style={styles.customBadgeText}>{tier.customBadgeText}</Text>
                  </View>
                ) : null}

                <View style={styles.tierHeader}>
                  <Text style={styles.tierName}>{tier.name}</Text>
                  {tier.showPrice !== false ? (
                    enterprise ? (
                      <Text style={styles.tierPrice}>Custom</Text>
                    ) : tier.isFreeTier && !pricing ? (
                      <Text style={styles.tierPrice}>Free</Text>
                    ) : pricing ? (
                      <View>
                        <Text style={styles.tierPrice}>
                          {formatPrice(pricing.price, currency)}
                          {pricing.billingFrequency ? (
                            <Text style={styles.tierInterval}>/{pricing.billingFrequency.toLowerCase()}</Text>
                          ) : null}
                        </Text>
                        {discount ? (
                          <View style={styles.discountBadge}>
                            <Text style={styles.discountBadgeText}>Save {discount}%</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null
                  ) : null}
                </View>

                {tier.description ? <Text style={styles.tierDescription}>{tier.description}</Text> : null}

                {showFeatureComparison && tier.features && tier.features.length > 0 ? (
                  <View style={styles.features}>
                    {tier.features.map((f) => (
                      <View key={f.id} style={styles.featureRow}>
                        <Text style={[styles.featureIcon, !f.isEnabled && styles.featureIconDisabled]}>
                          {f.isEnabled ? '\u2713' : '\u2717'}
                        </Text>
                        <Text style={[styles.featureText, !f.isEnabled && styles.featureTextDisabled]}>
                          {f.displayName}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {showLimits && tier.limits && tier.limits.length > 0 ? (
                  <View style={styles.limits}>
                    <Text style={styles.limitsHeading}>Limits</Text>
                    {tier.limits.map((l) => (
                      <View key={l.id} style={styles.limitRow}>
                        <Text style={styles.limitValue}>
                          {l.maxValue === -1 ? 'Unlimited' : l.maxValue.toLocaleString()}
                        </Text>
                        <Text style={styles.limitName}>
                          {l.displayName}
                          {l.unit ? ` (${l.unit})` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.footer}>
                  {enterprise && enterpriseContactUrl ? (
                    <Pressable style={styles.outlineButton} onPress={() => handleSelect(tier)}>
                      <Text style={styles.outlineButtonText}>Contact Sales</Text>
                    </Pressable>
                  ) : enterprise ? (
                    <Pressable style={styles.outlineButton} onPress={() => handleSelect(tier)}>
                      <Text style={styles.outlineButtonText}>Contact Sales</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={styles.primaryButton} onPress={() => handleSelect(tier)}>
                      <Text style={styles.primaryButtonText}>
                        {isPreSelected ? 'Continue with This Plan' : tier.isFreeTier ? 'Get Started' : 'Select Plan'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center' },
  alertError: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  alertErrorText: { color: '#991B1B', fontSize: 14 },
  billingToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16, gap: 10 },
  billingLabel: { fontSize: 14, fontWeight: '500', color: '#999' },
  billingLabelActive: { color: '#1a1a1a', fontWeight: '600' },
  billingAnnualGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  discountBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  discountBadgeText: { color: '#166534', fontSize: 11, fontWeight: '600' },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#666' },
  tierGrid: { gap: 16 },
  tierCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  tierCardPreSelected: { borderColor: '#007AFF', borderWidth: 2 },
  preSelectedBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  preSelectedBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  customBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  customBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  tierHeader: { marginBottom: 12 },
  tierName: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  tierPrice: { fontSize: 24, fontWeight: '700', color: '#007AFF' },
  tierInterval: { fontSize: 14, fontWeight: '400', color: '#666' },
  tierDescription: { fontSize: 14, color: '#666', marginBottom: 12, lineHeight: 20 },
  features: { marginBottom: 16 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  featureIcon: { color: '#22C55E', fontSize: 16, fontWeight: '700', marginRight: 8, lineHeight: 20 },
  featureIconDisabled: { color: '#999' },
  featureText: { fontSize: 14, color: '#333', flex: 1, lineHeight: 20 },
  featureTextDisabled: { color: '#999' },
  limits: { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 12, marginBottom: 12 },
  limitsHeading: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#999',
    marginBottom: 6,
  },
  limitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
  },
  limitValue: { fontSize: 13, fontWeight: '700', color: '#007AFF' },
  limitName: { fontSize: 13, color: '#666', textAlign: 'right', flex: 1, marginLeft: 8 },
  footer: { marginTop: 4 },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  outlineButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  outlineButtonText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
});
