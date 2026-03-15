import { View, Text, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierFeatureModel } from '@wildwood/core';

export interface TierCardFeaturesProps {
  features: AppTierFeatureModel[];
  style?: ViewStyle;
}

export function TierCardFeatures({ features, style }: TierCardFeaturesProps) {
  if (!features || features.length === 0) return null;

  return (
    <View style={[styles.container, style]}>
      {features.map((f) => (
        <View key={f.id} style={styles.row}>
          <Text style={[styles.icon, !f.isEnabled && styles.iconDisabled]}>{f.isEnabled ? '\u2713' : '\u2715'}</Text>
          <Text style={[styles.name, !f.isEnabled && styles.nameDisabled]}>{f.displayName}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  icon: { color: '#22C55E', fontSize: 16, fontWeight: '700', marginRight: 8, lineHeight: 20 },
  iconDisabled: { color: '#999' },
  name: { fontSize: 14, color: '#333', flex: 1, lineHeight: 20 },
  nameDisabled: { color: '#999' },
});
