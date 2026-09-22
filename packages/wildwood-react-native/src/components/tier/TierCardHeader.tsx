import { View, Text, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierPricingModel } from '@wildwood/core';
import { formatMoney, isRawBadgeColor, shouldShowTierStatusBadge, trialLabel } from '@wildwood/core';

export interface TierCardHeaderProps {
  name: string;
  iconClass?: string;
  badgeColor?: string;
  status?: string;
  showPrice?: boolean;
  isEnterprise: boolean;
  isFreeTier: boolean;
  pricing?: AppTierPricingModel;
  discount?: number | null;
  currency: string;
  style?: ViewStyle;
}

/**
 * Whether the card advertises a free trial. Only a priced plan can start one: an enterprise
 * "contact us" card, a free tier and a plan whose price is zero have nothing to trial, and a card
 * that hides its price says nothing about billing at all. Exported because this package has no React
 * renderer, so the rule is tested as the function the header calls.
 */
export function showsTrialLine(input: {
  showPrice: boolean;
  isEnterprise: boolean;
  isFreeTier: boolean;
  pricing?: Pick<AppTierPricingModel, 'price' | 'trialDays'>;
}): boolean {
  const { showPrice, isEnterprise, isFreeTier, pricing } = input;
  return showPrice && !isEnterprise && !isFreeTier && !!pricing && pricing.price > 0 && (pricing.trialDays ?? 0) > 0;
}

export function TierCardHeader({
  name,
  badgeColor,
  status,
  showPrice = true,
  isEnterprise,
  isFreeTier,
  pricing,
  discount,
  currency,
  style,
}: TierCardHeaderProps) {
  // badgeColor may be a semantic token ("success") or a raw CSS color ("#c9a227"); raw colors
  // become an inline backgroundColor (predicates shared via @wildwood/core).
  const isRawColor = isRawBadgeColor(badgeColor);
  const showStatusBadge = shouldShowTierStatusBadge(badgeColor, status);
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.name}>{name}</Text>
      {showStatusBadge ? (
        <View style={[styles.statusBadge, isRawColor ? { backgroundColor: badgeColor } : null]}>
          <Text style={[styles.statusBadgeText, isRawColor ? styles.statusBadgeTextRaw : null]}>{status}</Text>
        </View>
      ) : null}
      {showPrice ? (
        <View style={styles.priceRow}>
          {isEnterprise ? (
            <Text style={styles.priceAmount}>Custom</Text>
          ) : isFreeTier && !pricing ? (
            <Text style={styles.priceAmount}>Free</Text>
          ) : pricing ? (
            <>
              {/* `formatMoney`, not the older `formatPrice`: the symbol comes from Intl, so a
                  currency outside the seven-entry symbol table (CHF, SEK, ...) renders as itself
                  instead of silently falling back to a dollar sign. Byte-identical output for the
                  currencies that table does carry. */}
              <Text style={styles.priceAmount}>{formatMoney(pricing.price, currency)}</Text>
              <Text style={styles.priceInterval}>/{pricing.billingFrequency?.toLowerCase() ?? 'month'}</Text>
            </>
          ) : null}
        </View>
      ) : null}
      {discount ? (
        <View style={styles.discountBadge}>
          <Text style={styles.discountText}>Save {discount}%</Text>
        </View>
      ) : null}
      {showsTrialLine({ showPrice, isEnterprise, isFreeTier, pricing }) ? (
        <Text style={styles.trialLine}>{trialLabel(pricing?.trialDays)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  name: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  statusBadge: {
    backgroundColor: '#DBEAFE',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  statusBadgeText: { color: '#1D4ED8', fontSize: 11, fontWeight: '600' },
  statusBadgeTextRaw: { color: '#fff' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  priceAmount: { fontSize: 24, fontWeight: '700', color: '#007AFF' },
  priceInterval: { fontSize: 14, fontWeight: '400', color: '#666' },
  discountBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  discountText: { color: '#166534', fontSize: 11, fontWeight: '600' },
  trialLine: { fontSize: 13, fontWeight: '600', color: '#166534', marginTop: 4 },
});
