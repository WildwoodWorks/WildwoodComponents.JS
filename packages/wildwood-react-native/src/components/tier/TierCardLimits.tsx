import { View, Text, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierLimitModel } from '@wildwood/core';

export interface TierCardLimitsProps {
  limits: AppTierLimitModel[];
  style?: ViewStyle;
}

export function TierCardLimits({ limits, style }: TierCardLimitsProps) {
  if (!limits || limits.length === 0) return null;

  return (
    <View style={[styles.container, style]}>
      {limits.map((l) => (
        <View key={l.id} style={styles.row}>
          <Text style={styles.value}>{l.maxValue === -1 ? 'Unlimited' : l.maxValue.toLocaleString()}</Text>
          <Text style={styles.name}>
            {l.displayName}
            {l.unit ? ` (${l.unit})` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
  },
  value: { fontSize: 13, fontWeight: '700', color: '#007AFF' },
  name: { fontSize: 13, color: '#666', textAlign: 'right', flex: 1, marginLeft: 8 },
});
