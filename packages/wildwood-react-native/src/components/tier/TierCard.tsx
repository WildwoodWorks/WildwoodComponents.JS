import { View, Text, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierModel, AppTierPricingModel } from '@wildwood/core';
import { isEnterpriseTier } from '@wildwood/core';
import { TierCardHeader } from './TierCardHeader';
import { TierCardFeatures } from './TierCardFeatures';
import { TierCardLimits } from './TierCardLimits';
import { TierCardFooter } from './TierCardFooter';

export interface TierCardProps {
  tier: AppTierModel;
  pricing?: AppTierPricingModel;
  currency?: string;
  discount?: number | null;
  isCurrent?: boolean;
  isPreSelected?: boolean;
  hasSubscription?: boolean;
  showFeatures?: boolean;
  showLimits?: boolean;
  enterpriseContactUrl?: string;
  disabled?: boolean;
  processingText?: string;
  onSelect?: (tier: AppTierModel) => void;
  style?: ViewStyle;
}

export function TierCard({
  tier,
  pricing,
  currency = 'USD',
  discount,
  isCurrent,
  isPreSelected,
  hasSubscription,
  showFeatures = true,
  showLimits = true,
  enterpriseContactUrl,
  disabled,
  processingText,
  onSelect,
  style,
}: TierCardProps) {
  const enterprise = isEnterpriseTier(tier);

  return (
    <View style={[styles.card, isCurrent && styles.cardCurrent, isPreSelected && styles.cardPreSelected, style]}>
      {isCurrent ? null : tier.customBadgeText ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{tier.customBadgeText}</Text>
        </View>
      ) : isPreSelected ? (
        <View style={styles.badgePreSelected}>
          <Text style={styles.badgeText}>Your Selection</Text>
        </View>
      ) : null}

      <TierCardHeader
        name={tier.name}
        iconClass={tier.iconClass}
        badgeColor={tier.badgeColor}
        status={tier.status}
        showPrice={tier.showPrice !== false}
        isEnterprise={enterprise}
        isFreeTier={tier.isFreeTier}
        pricing={pricing}
        discount={discount}
        currency={currency}
      />

      {tier.description ? <Text style={styles.description}>{tier.description}</Text> : null}

      {showFeatures ? <TierCardFeatures features={tier.features} /> : null}
      {showLimits ? <TierCardLimits limits={tier.limits} /> : null}

      <TierCardFooter
        tier={tier}
        isEnterprise={enterprise}
        isCurrent={isCurrent}
        isPreSelected={isPreSelected}
        hasSubscription={hasSubscription}
        enterpriseContactUrl={enterpriseContactUrl}
        disabled={disabled}
        processingText={processingText}
        onSelect={onSelect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
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
  cardCurrent: { borderColor: '#22C55E', borderWidth: 2 },
  cardPreSelected: { borderColor: '#007AFF', borderWidth: 2 },
  badge: {
    backgroundColor: '#007AFF',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  badgePreSelected: {
    backgroundColor: '#007AFF',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  description: { fontSize: 14, color: '#666', marginBottom: 12, lineHeight: 20 },
});
