import { useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable, TextInput } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppFeatureDefinitionModel, AppFeatureOverrideModel } from '@wildwood/core';

export interface FeaturesPanelProps {
  features: AppFeatureDefinitionModel[];
  featureOverrides?: AppFeatureOverrideModel[];
  isAdmin?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  onToggleFeature?: (featureCode: string, isEnabled: boolean, reason?: string, expiresAt?: string) => Promise<void>;
}

const EXPIRATION_OPTIONS = [
  { label: 'No expiration', value: '' },
  { label: '1 hour', value: '1h' },
  { label: '1 day', value: '1d' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
];

function parseExpiration(value: string): string | undefined {
  if (!value) return undefined;
  const now = new Date();
  const ms: Record<string, number> = { '1h': 3600000, '1d': 86400000, '7d': 604800000, '30d': 2592000000 };
  return ms[value] ? new Date(now.getTime() + ms[value]).toISOString() : undefined;
}

export function FeaturesPanel({
  features,
  featureOverrides = [],
  isAdmin = false,
  loading,
  style,
  onToggleFeature,
}: FeaturesPanelProps) {
  const [confirmingFeature, setConfirmingFeature] = useState<string | null>(null);
  const [confirmExpirationIdx, setConfirmExpirationIdx] = useState(0);
  const [confirmReason, setConfirmReason] = useState('');
  const [processingFeature, setProcessingFeature] = useState<string | null>(null);

  const hasOverride = useCallback(
    (featureCode: string) => featureOverrides.some((o) => o.featureCode === featureCode),
    [featureOverrides],
  );

  const handleRequestToggle = useCallback((featureCode: string) => {
    setConfirmingFeature(featureCode);
    setConfirmExpirationIdx(0);
    setConfirmReason('');
  }, []);

  const handleCancelToggle = useCallback(() => {
    setConfirmingFeature(null);
  }, []);

  const handleConfirmToggle = useCallback(
    async (feature: AppFeatureDefinitionModel) => {
      if (!onToggleFeature || processingFeature) return;
      setProcessingFeature(feature.featureCode);
      try {
        const expiresAt = parseExpiration(EXPIRATION_OPTIONS[confirmExpirationIdx].value);
        await onToggleFeature(feature.featureCode, !feature.isEnabled, confirmReason || undefined, expiresAt);
        setConfirmingFeature(null);
      } finally {
        setProcessingFeature(null);
      }
    },
    [onToggleFeature, processingFeature, confirmExpirationIdx, confirmReason],
  );

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
                <View key={f.featureCode}>
                  <View style={[styles.featureCard, f.isEnabled ? styles.featureEnabled : styles.featureLocked]}>
                    <Text style={[styles.featureIcon, { color: f.isEnabled ? '#22C55E' : '#999' }]}>
                      {f.isEnabled ? '\u2713' : '\u2715'}
                    </Text>
                    <View style={styles.featureBody}>
                      <View style={styles.featureNameRow}>
                        <Text style={styles.featureName}>{f.displayName}</Text>
                        {isAdmin && hasOverride(f.featureCode) && (
                          <Text style={styles.overrideBadge}>{'\u{1F6E1}'}</Text>
                        )}
                      </View>
                      {f.description ? <Text style={styles.featureDesc}>{f.description}</Text> : null}
                    </View>
                    {isAdmin && onToggleFeature ? (
                      processingFeature === f.featureCode ? (
                        <ActivityIndicator size="small" color="#007AFF" />
                      ) : (
                        <Pressable
                          style={[styles.toggleBtn, f.isEnabled ? styles.toggleOn : styles.toggleOff]}
                          onPress={() => handleRequestToggle(f.featureCode)}
                        >
                          <Text style={[styles.toggleText, f.isEnabled ? styles.toggleOnText : styles.toggleOffText]}>
                            {f.isEnabled ? 'Enabled' : 'Locked'}
                          </Text>
                        </Pressable>
                      )
                    ) : (
                      <View style={[styles.badge, f.isEnabled ? styles.badgeSuccess : styles.badgeSecondary]}>
                        <Text
                          style={[styles.badgeText, f.isEnabled ? styles.badgeSuccessText : styles.badgeSecondaryText]}
                        >
                          {f.isEnabled ? 'Enabled' : 'Locked'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {isAdmin && confirmingFeature === f.featureCode && (
                    <View style={styles.confirmRow}>
                      <Text style={styles.confirmMessage}>
                        {f.isEnabled ? 'Disable' : 'Enable'} {f.displayName}?
                      </Text>
                      <View style={styles.confirmOptions}>
                        {EXPIRATION_OPTIONS.map((opt, idx) => (
                          <Pressable
                            key={opt.value}
                            style={[styles.expirationOption, confirmExpirationIdx === idx && styles.expirationSelected]}
                            onPress={() => setConfirmExpirationIdx(idx)}
                          >
                            <Text
                              style={[
                                styles.expirationText,
                                confirmExpirationIdx === idx && styles.expirationSelectedText,
                              ]}
                            >
                              {opt.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <TextInput
                        style={styles.reasonInput}
                        placeholder="Reason (optional)"
                        value={confirmReason}
                        onChangeText={setConfirmReason}
                      />
                      <View style={styles.confirmActions}>
                        <Pressable style={styles.confirmYes} onPress={() => handleConfirmToggle(f)}>
                          <Text style={styles.confirmYesText}>Confirm</Text>
                        </Pressable>
                        <Pressable style={styles.confirmNo} onPress={handleCancelToggle}>
                          <Text style={styles.confirmNoText}>Cancel</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
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
  categoryName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginTop: 4 },
  featureList: { gap: 8 },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    gap: 10,
  },
  featureEnabled: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  featureLocked: { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB' },
  featureIcon: { fontSize: 18, fontWeight: '700', width: 24, textAlign: 'center' },
  featureBody: { flex: 1 },
  featureNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  featureName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  featureDesc: { fontSize: 12, color: '#666', marginTop: 2 },
  overrideBadge: { fontSize: 12 },
  badge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  badgeSuccess: { backgroundColor: '#DCFCE7' },
  badgeSecondary: { backgroundColor: '#F3F4F6' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeSuccessText: { color: '#166534' },
  badgeSecondaryText: { color: '#6B7280' },
  toggleBtn: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  toggleOn: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  toggleOff: { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' },
  toggleText: { fontSize: 12, fontWeight: '600' },
  toggleOnText: { color: '#166534' },
  toggleOffText: { color: '#6B7280' },
  confirmRow: {
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  confirmMessage: { fontSize: 14, fontWeight: '600', color: '#92400E' },
  confirmOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  expirationOption: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  expirationSelected: { backgroundColor: '#DBEAFE', borderColor: '#93C5FD' },
  expirationText: { fontSize: 12, color: '#6B7280' },
  expirationSelectedText: { color: '#1D4ED8' },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    backgroundColor: '#fff',
  },
  confirmActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  confirmYes: { backgroundColor: '#22C55E', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 6 },
  confirmYesText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  confirmNo: { backgroundColor: '#F3F4F6', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 6 },
  confirmNoText: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
});
