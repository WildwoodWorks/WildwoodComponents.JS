import { View, Text, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierPricingModel } from '@wildwood/core';
import { formatPrice } from '@wildwood/core';

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
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.name}>{name}</Text>
      {badgeColor && status ? (
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{status}</Text>
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
              <Text style={styles.priceAmount}>{formatPrice(pricing.price, currency)}</Text>
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
});
