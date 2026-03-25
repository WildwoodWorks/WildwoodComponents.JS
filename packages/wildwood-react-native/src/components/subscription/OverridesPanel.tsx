import { useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppFeatureOverrideModel } from '@wildwood/core';

export interface OverridesPanelProps {
  overrides: AppFeatureOverrideModel[];
  loading?: boolean;
  style?: ViewStyle;
  onRemoveOverride?: (featureCode: string) => Promise<void>;
  onMakePermanent?: (override: AppFeatureOverrideModel) => Promise<void>;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function OverridesPanel({ overrides, loading, style, onRemoveOverride, onMakePermanent }: OverridesPanelProps) {
  const [processingFeatureCode, setProcessingFeatureCode] = useState<string | null>(null);

  const handleRemove = useCallback(
    async (ov: AppFeatureOverrideModel) => {
      if (!onRemoveOverride || processingFeatureCode) return;
      setProcessingFeatureCode(ov.featureCode);
      try {
        await onRemoveOverride(ov.featureCode);
      } finally {
        setProcessingFeatureCode(null);
      }
    },
    [onRemoveOverride, processingFeatureCode],
  );

  const handleMakePermanent = useCallback(
    async (ov: AppFeatureOverrideModel) => {
      if (!onMakePermanent || processingFeatureCode) return;
      setProcessingFeatureCode(ov.featureCode);
      try {
        await onMakePermanent(ov);
      } finally {
        setProcessingFeatureCode(null);
      }
    },
    [onMakePermanent, processingFeatureCode],
  );

  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!overrides.length) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.emptyText}>No active feature overrides.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <Text style={styles.headerText}>
          {overrides.length} active {overrides.length === 1 ? 'override' : 'overrides'}
        </Text>
      </View>

      {overrides.map((ov) => {
        const isProcessing = processingFeatureCode === ov.featureCode;
        return (
          <View key={ov.featureCode} style={[styles.card, isProcessing && styles.cardProcessing]}>
            <View style={styles.cardRow}>
              <Text style={styles.featureCode}>{ov.featureCode}</Text>
              <View style={[styles.statusBadge, ov.isEnabled ? styles.statusEnabled : styles.statusDisabled]}>
                <Text style={[styles.statusText, ov.isEnabled ? styles.statusEnabledText : styles.statusDisabledText]}>
                  {ov.isEnabled ? 'Enabled' : 'Disabled'}
                </Text>
              </View>
            </View>

            {ov.reason ? <Text style={styles.reason}>{ov.reason}</Text> : <Text style={styles.noValue}>No reason</Text>}

            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Expires:</Text>
              <Text style={styles.dateValue}>{ov.expiresAt ? formatDate(ov.expiresAt) : 'Never'}</Text>
            </View>

            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Created:</Text>
              <Text style={styles.dateValue}>{formatDate(ov.createdAt)}</Text>
            </View>

            {isProcessing ? (
              <ActivityIndicator size="small" color="#007AFF" style={styles.actionSpinner} />
            ) : (
              <View style={styles.actions}>
                {ov.expiresAt && onMakePermanent && (
                  <Pressable style={styles.permanentBtn} onPress={() => handleMakePermanent(ov)}>
                    <Text style={styles.permanentBtnText}>{'\u221E'} Permanent</Text>
                  </Pressable>
                )}
                {onRemoveOverride && (
                  <Pressable style={styles.removeBtn} onPress={() => handleRemove(ov)}>
                    <Text style={styles.removeBtnText}>{'\u2717'} Remove</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  loadingText: { marginTop: 8, fontSize: 14, color: '#666', textAlign: 'center' },
  emptyText: { fontSize: 14, color: '#999', textAlign: 'center', paddingVertical: 16 },
  header: {
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    padding: 12,
  },
  headerText: { fontSize: 14, fontWeight: '600', color: '#0369A1' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  cardProcessing: { opacity: 0.5 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  featureCode: { fontSize: 13, fontWeight: '700', color: '#1a1a1a', fontFamily: 'monospace' },
  statusBadge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  statusEnabled: { backgroundColor: '#DCFCE7' },
  statusDisabled: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 11, fontWeight: '600' },
  statusEnabledText: { color: '#166534' },
  statusDisabledText: { color: '#991B1B' },
  reason: { fontSize: 13, color: '#4B5563' },
  noValue: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' },
  dateRow: { flexDirection: 'row', gap: 4 },
  dateLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  dateValue: { fontSize: 12, color: '#6B7280' },
  actionSpinner: { marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  permanentBtn: {
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  permanentBtnText: { color: '#2563EB', fontSize: 12, fontWeight: '600' },
  removeBtn: {
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  removeBtnText: { color: '#DC2626', fontSize: 12, fontWeight: '600' },
});
