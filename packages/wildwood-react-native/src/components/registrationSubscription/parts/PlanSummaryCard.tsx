// The plan a signup link already chose, shown above the registration form.
//
// The visitor picked this on a pricing screen, so the signup does not ask again - it shows what they
// are getting, at the price the catalog is quoting this minute, and offers a way back to the grid.
//
// A plan with no pricing option is never given a made-up number: a free plan says so, and anything
// else says nothing rather than implying it costs nothing.

import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierModel, AppTierPricingModel } from '@wildwood/core';
import { formatMoney, trialLabel } from '@wildwood/core';
import type { RegistrationSubscriptionLabels } from '@wildwood/react-shared';
import { planPeriodSuffix } from '../views/signupViewModel';

export interface PlanSummaryCardProps {
  /** The chosen plan, from the live catalog. */
  tier: AppTierModel;
  /** The pricing option being bought, or null for a plan with no price at all. */
  pricing?: AppTierPricingModel | null;
  /** The currency the catalog is quoted in. */
  currency: string;
  labels: RegistrationSubscriptionLabels;
  /** Offers "Change plan". Omitted, the card is read-only (the plan is not the visitor's to change). */
  onChangePlan?: () => void;
  style?: ViewStyle;
}

export function PlanSummaryCard({ tier, pricing, currency, labels, onChangePlan, style }: PlanSummaryCardProps) {
  const trial = tier.isFreeTier ? '' : trialLabel(pricing?.trialDays);

  return (
    <View style={[styles.card, style]} testID="plan-summary-card">
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.name}>{tier.name}</Text>
          {tier.description ? <Text style={styles.description}>{tier.description}</Text> : null}
        </View>
        <View style={styles.price}>
          {pricing ? (
            <>
              <Text style={styles.amount}>{formatMoney(pricing.price, currency)}</Text>
              <Text style={styles.period}>{planPeriodSuffix(pricing.billingFrequency)}</Text>
            </>
          ) : (
            <Text style={styles.amount}>{tier.isFreeTier ? labels.planFree : ''}</Text>
          )}
        </View>
      </View>

      {trial ? <Text style={styles.trial}>{trial}</Text> : null}

      {onChangePlan ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.changePlan}
          onPress={onChangePlan}
          testID="plan-change"
        >
          <Text style={styles.changeLink}>{labels.changePlan}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 8,
    marginBottom: 16,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  description: { fontSize: 13, color: '#666' },
  price: { flexDirection: 'row', alignItems: 'baseline' },
  amount: { fontSize: 20, fontWeight: '700', color: '#007AFF' },
  period: { fontSize: 13, color: '#666' },
  trial: { fontSize: 13, fontWeight: '600', color: '#166534' },
  changeLink: { color: '#007AFF', fontSize: 14, fontWeight: '600' },
});
