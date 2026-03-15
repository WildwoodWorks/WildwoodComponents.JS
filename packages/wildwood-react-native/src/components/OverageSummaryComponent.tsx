import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useUsageDashboard } from '../hooks/useUsageDashboard';

export interface OverageSummaryComponentProps {
  overageRate?: number;
  currencySymbol?: string;
  onViewDetails?: () => void;
  style?: ViewStyle;
}

interface OverageItem {
  limitCode: string;
  displayName: string;
  overageCount: number;
  cost: number;
  unit: string;
}

export function OverageSummaryComponent({
  overageRate = 0.003,
  currencySymbol = '$',
  onViewDetails,
  style,
}: OverageSummaryComponentProps) {
  const { limitStatuses } = useUsageDashboard();

  const overageItems: OverageItem[] = useMemo(() => {
    return limitStatuses
      .filter((s) => s.isExceeded && !s.isHardBlocked && !s.isUnlimited)
      .map((s) => ({
        limitCode: s.limitCode,
        displayName: s.displayName,
        overageCount: s.currentUsage - s.maxValue,
        cost: (s.currentUsage - s.maxValue) * overageRate,
        unit: s.unit,
      }));
  }, [limitStatuses, overageRate]);

  const totalCost = useMemo(() => overageItems.reduce((sum, item) => sum + item.cost, 0), [overageItems]);

  if (overageItems.length === 0) return null;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <Text style={styles.warningIcon}>{'\u26A0'}</Text>
        <Text style={styles.title}>Overage Charges</Text>
      </View>

      <View style={styles.items}>
        {overageItems.map((item) => (
          <View key={item.limitCode} style={styles.item}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.displayName}</Text>
              <Text style={styles.itemCount}>
                {item.overageCount.toLocaleString()} over limit{item.unit ? ` (${item.unit})` : ''}
              </Text>
            </View>
            <Text style={styles.itemCost}>
              {currencySymbol}
              {item.cost.toFixed(2)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Estimated Total</Text>
        <Text style={styles.totalAmount}>
          {currencySymbol}
          {totalCost.toFixed(2)}
        </Text>
      </View>

      <Text style={styles.rateNote}>
        Rate: {currencySymbol}
        {overageRate.toFixed(4)} per unit
      </Text>

      {onViewDetails ? (
        <Pressable style={styles.detailsButton} onPress={onViewDetails}>
          <Text style={styles.detailsButtonText}>View Details {'\u203A'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#FEF3C7', borderRadius: 10, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  warningIcon: { fontSize: 20 },
  title: { fontSize: 16, fontWeight: '700', color: '#92400E' },
  items: { gap: 8, marginBottom: 12 },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  itemCount: { fontSize: 12, color: '#92400E' },
  itemCost: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginLeft: 12 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F59E0B',
    paddingTop: 10,
    marginBottom: 8,
  },
  totalLabel: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  totalAmount: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  rateNote: { fontSize: 12, color: '#92400E', marginBottom: 8 },
  detailsButton: { alignSelf: 'flex-start' },
  detailsButtonText: { color: '#007AFF', fontSize: 14, fontWeight: '600' },
});
