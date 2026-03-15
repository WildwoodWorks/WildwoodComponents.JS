import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppFeatureDefinitionModel } from '@wildwood/core';

export interface FeaturesPanelProps {
  features: AppFeatureDefinitionModel[];
  loading?: boolean;
  style?: ViewStyle;
}

export function FeaturesPanel({ features, loading, style }: FeaturesPanelProps) {
  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!features.length) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.alertInfo}>
          <Text style={styles.alertInfoText}>No features configured.</Text>
        </View>
      </View>
    );
  }

  const categories = [...new Set(features.map((f) => f.category).filter(Boolean))];
  if (categories.length === 0) categories.push('');

  const enabledCount = features.filter((f) => f.isEnabled).length;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {enabledCount} of {features.length} features enabled
        </Text>
      </View>

      {categories.map((category) => {
        const catFeatures = features.filter((f) => (f.category || '') === category);
        return (
          <View key={category || '_uncategorized'} style={styles.categoryCard}>
            {category ? <Text style={styles.categoryName}>{category}</Text> : null}
            <View style={styles.featureList}>
              {catFeatures.map((f) => (
                <View
                  key={f.featureCode}
                  style={[styles.featureCard, f.isEnabled ? styles.featureEnabled : styles.featureLocked]}
                >
                  <Text style={[styles.featureIcon, { color: f.isEnabled ? '#22C55E' : '#999' }]}>
                    {f.isEnabled ? '\u2713' : '\u2715'}
                  </Text>
                  <View style={styles.featureBody}>
                    <Text style={styles.featureName}>{f.displayName}</Text>
                    {f.description ? <Text style={styles.featureDesc}>{f.description}</Text> : null}
                  </View>
                  <View style={[styles.badge, f.isEnabled ? styles.badgeSuccess : styles.badgeSecondary]}>
                    <Text style={[styles.badgeText, f.isEnabled ? styles.badgeSuccessText : styles.badgeSecondaryText]}>
                      {f.isEnabled ? 'Enabled' : 'Locked'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  loadingText: { marginTop: 8, fontSize: 14, color: '#666', textAlign: 'center' },
  alertInfo: { backgroundColor: '#DBEAFE', borderRadius: 8, padding: 12 },
  alertInfoText: { color: '#1D4ED8', fontSize: 14 },
  summary: {
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryText: { fontSize: 14, fontWeight: '600', color: '#0369A1' },
  categoryCard: { gap: 8 },
  categoryName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    marginTop: 4,
  },
  featureList: { gap: 8 },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    gap: 10,
  },
  featureEnabled: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  featureLocked: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
  },
  featureIcon: { fontSize: 18, fontWeight: '700', width: 24, textAlign: 'center' },
  featureBody: { flex: 1 },
  featureName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  featureDesc: { fontSize: 12, color: '#666', marginTop: 2 },
  badge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  badgeSuccess: { backgroundColor: '#DCFCE7' },
  badgeSecondary: { backgroundColor: '#F3F4F6' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeSuccessText: { color: '#166534' },
  badgeSecondaryText: { color: '#6B7280' },
});
