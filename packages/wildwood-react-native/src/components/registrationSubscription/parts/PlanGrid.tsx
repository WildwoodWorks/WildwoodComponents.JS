// The plan grid: the monthly/annual toggle over a column of `TierCard`s.
//
// Deliberately the SAME `TierCard` the native `PricingDisplayComponent` and `TierPlansPanel` render,
// footer CTAs and all, rather than a second plan card that would drift from it. This grid adds only
// what the component needs on top: the plans come from the live public catalog, and the billing
// cycle is owned by the pricing view so a pack selection can be stamped with it too.
//
// Every decision here - which option a plan is quoted at, the best annual saving - is a function
// from `pricingViewModel`, because this package has no renderer to test JSX with.

import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierModel } from '@wildwood/core';
import { computeAnnualDiscount, hasAnnualPricing } from '@wildwood/core';
import {
  formatRegistrationSubscriptionLabel as formatLabel,
  type RegistrationSubscriptionLabels,
} from '@wildwood/react-shared';
import { TierCard } from '../../tier/TierCard';
import type { PricingBilling } from '../types';
import { bestAnnualDiscount, isHighlightedTier, planPriceOption } from '../views/pricingViewModel';

export interface PlanGridProps {
  /** Active plans in catalog order. Already filtered - this grid renders what it is given. */
  tiers: AppTierModel[];
  /** The currency every price in the grid is quoted in. */
  currency: string;
  billing: PricingBilling;
  onBillingChange: (billing: PricingBilling) => void;
  showBillingToggle?: boolean;
  showFeatures?: boolean;
  showLimits?: boolean;
  /** Marks one plan as already chosen. */
  highlightTierId?: string;
  /** Where an enterprise plan's "Contact Sales" button points. Opened with `Linking.openURL`. */
  contactUrl?: string;
  labels: RegistrationSubscriptionLabels;
  onSelectTier: (tier: AppTierModel) => void;
  style?: ViewStyle;
}

export function PlanGrid({
  tiers,
  currency,
  billing,
  onBillingChange,
  showBillingToggle = true,
  showFeatures = true,
  showLimits = true,
  highlightTierId,
  contactUrl,
  labels,
  onSelectTier,
  style,
}: PlanGridProps) {
  const annual = billing === 'annual';
  // A toggle with nothing to switch to is a control that lies, so it only appears once some plan is
  // actually priced by the year.
  const withToggle = showBillingToggle && hasAnnualPricing(tiers);
  const maxDiscount = withToggle ? bestAnnualDiscount(tiers) : 0;

  return (
    <View style={[styles.plans, style]}>
      {withToggle ? (
        <View style={styles.billingToggle}>
          <Text style={[styles.billingLabel, annual ? null : styles.billingLabelActive]}>{labels.billingMonthly}</Text>
          <Pressable
            style={[styles.toggleTrack, annual ? styles.toggleTrackOn : null]}
            onPress={() => onBillingChange(annual ? 'monthly' : 'annual')}
            accessibilityRole="switch"
            accessibilityLabel={labels.billingToggleAriaLabel}
            accessibilityState={{ checked: annual }}
            testID="billing-toggle"
          >
            <View style={[styles.toggleThumb, annual ? styles.toggleThumbOn : null]} />
          </Pressable>
          <View style={styles.billingAnnualGroup}>
            <Text style={[styles.billingLabel, annual ? styles.billingLabelActive : null]}>{labels.billingAnnual}</Text>
            {maxDiscount > 0 ? (
              <View style={styles.discountBadge}>
                <Text style={styles.discountBadgeText}>
                  {formatLabel(labels.annualSavings, { percent: maxDiscount })}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.tierGrid}>
        {tiers.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            pricing={planPriceOption(tier, billing)}
            currency={currency}
            discount={annual ? computeAnnualDiscount(tier) : null}
            isPreSelected={isHighlightedTier(tier.id, highlightTierId)}
            showFeatures={showFeatures}
            showLimits={showLimits}
            enterpriseContactUrl={contactUrl}
            onSelect={onSelectTier}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plans: { gap: 16 },
  billingToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
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
    shadowOpacity: 0.2,
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
  },
  discountBadgeText: { color: '#166534', fontSize: 11, fontWeight: '600' },
  tierGrid: { gap: 16 },
});
