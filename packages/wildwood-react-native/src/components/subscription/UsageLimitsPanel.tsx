import { useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable, TextInput } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierLimitStatusModel } from '@wildwood/core';

export interface UsageLimitsPanelProps {
  limitStatuses: AppTierLimitStatusModel[];
  isAdmin?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  onUpdateLimit?: (limitCode: string, newMaxValue: number) => Promise<void>;
  onResetUsage?: (limitCode: string) => Promise<void>;
}

function getStatusBadge(limit: AppTierLimitStatusModel): { text: string; color: string } {
  if (limit.isUnlimited) return { text: 'Unlimited', color: '#22C55E' };
  if (limit.isHardBlocked) return { text: 'Blocked', color: '#EF4444' };
  if (limit.isExceeded) return { text: 'Exceeded', color: '#EF4444' };
  if (limit.isAtWarningThreshold) return { text: 'Warning', color: '#F59E0B' };
  return { text: 'OK', color: '#22C55E' };
}

function getBarColor(limit: AppTierLimitStatusModel): string {
  if (limit.isUnlimited) return '#22C55E';
  if (limit.isHardBlocked || limit.isExceeded) return '#EF4444';
  if (limit.isAtWarningThreshold) return '#F59E0B';
  return '#22C55E';
}

function getCardBorderColor(limit: AppTierLimitStatusModel): string {
  if (limit.isHardBlocked || limit.isExceeded) return '#FECACA';
  if (limit.isAtWarningThreshold) return '#FDE68A';
  return '#BBF7D0';
}

export function UsageLimitsPanel({
  limitStatuses,
  isAdmin = false,
  loading,
  style,
  onUpdateLimit,
  onResetUsage,
}: UsageLimitsPanelProps) {
  const [editingLimitCode, setEditingLimitCode] = useState<string | null>(null);
  const [editMaxValue, setEditMaxValue] = useState('0');
  const [isProcessing, setIsProcessing] = useState(false);

  const startEditLimit = useCallback((limit: AppTierLimitStatusModel) => {
    setEditingLimitCode(limit.limitCode);
    setEditMaxValue(String(limit.maxValue));
  }, []);

  const cancelEditLimit = useCallback(() => {
    setEditingLimitCode(null);
  }, []);

  const saveLimitMaxValue = useCallback(
    async (limitCode: string) => {
      if (!onUpdateLimit || isProcessing) return;
      setIsProcessing(true);
      try {
        await onUpdateLimit(limitCode, Number(editMaxValue));
        setEditingLimitCode(null);
      } finally {
        setIsProcessing(false);
      }
    },
    [onUpdateLimit, isProcessing, editMaxValue],
  );

  const handleResetUsage = useCallback(
    async (limitCode: string) => {
      if (!onResetUsage || isProcessing) return;
      setIsProcessing(true);
      try {
        await onResetUsage(limitCode);
      } finally {
        setIsProcessing(false);
      }
    },
    [onResetUsage, isProcessing],
  );

  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!limitStatuses.length) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.alertInfo}>
          <Text style={styles.alertInfoText}>No usage limits configured.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {limitStatuses.map((limit) => {
        const badge = getStatusBadge(limit);
        const barWidth = limit.isUnlimited ? 100 : Math.min(limit.usagePercent, 100);
        const barColor = getBarColor(limit);
        const borderColor = getCardBorderColor(limit);
        const isEditing = editingLimitCode === limit.limitCode;

        return (
          <View key={limit.limitCode} style={[styles.card, { borderColor }]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardName}>{limit.displayName}</Text>
              <View style={[styles.badge, { backgroundColor: badge.color + '22' }]}>
                <Text style={[styles.badgeText, { color: badge.color }]}>{badge.text}</Text>
              </View>
            </View>

            {limit.unit ? <Text style={styles.unitText}>{limit.unit}</Text> : null}

            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${barWidth}%`, backgroundColor: barColor }]} />
            </View>

            <View style={styles.stats}>
              {limit.isUnlimited ? (
                <Text style={styles.statCount}>{limit.currentUsage.toLocaleString()} used</Text>
              ) : isAdmin && isEditing ? (
                <View style={styles.editRow}>
                  <Text style={styles.statCount}>{limit.currentUsage.toLocaleString()} /</Text>
                  <TextInput
                    style={styles.editInput}
                    keyboardType="numeric"
                    value={editMaxValue}
                    onChangeText={setEditMaxValue}
                    editable={!isProcessing}
                  />
                  <Pressable
                    style={styles.editSaveBtn}
                    onPress={() => saveLimitMaxValue(limit.limitCode)}
                    disabled={isProcessing}
                  >
                    <Text style={styles.editSaveBtnText}>{'\u2713'}</Text>
                  </Pressable>
                  <Pressable style={styles.editCancelBtn} onPress={cancelEditLimit} disabled={isProcessing}>
                    <Text style={styles.editCancelBtnText}>{'\u2717'}</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text style={styles.statCount}>
                    {limit.currentUsage.toLocaleString()} / {limit.maxValue.toLocaleString()}
                  </Text>
                  <Text style={styles.statPercent}>{Math.round(limit.usagePercent)}%</Text>
                </>
              )}
            </View>

            {limit.statusMessage ? <Text style={styles.statusMessage}>{limit.statusMessage}</Text> : null}

            {isAdmin && !isEditing && (
              <View style={styles.adminActions}>
                {!limit.isUnlimited && onUpdateLimit && (
                  <Pressable style={styles.adminBtn} onPress={() => startEditLimit(limit)} disabled={isProcessing}>
                    <Text style={styles.adminBtnText}>Edit Limit</Text>
                  </Pressable>
                )}
                {limit.currentUsage > 0 && onResetUsage && (
                  <Pressable
                    style={[styles.adminBtn, styles.adminBtnWarning]}
                    onPress={() => handleResetUsage(limit.limitCode)}
                    disabled={isProcessing}
                  >
                    <Text style={styles.adminBtnWarningText}>Reset Usage</Text>
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
  alertInfo: { backgroundColor: '#DBEAFE', borderRadius: 8, padding: 12 },
  alertInfoText: { color: '#1D4ED8', fontSize: 14 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 14, fontWeight: '600', color: '#1a1a1a', flex: 1 },
  unitText: { fontSize: 12, color: '#999' },
  badge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  barTrack: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
  },
  barFill: { height: '100%', borderRadius: 4 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statCount: { fontSize: 13, fontWeight: '600', color: '#333' },
  statPercent: { fontSize: 13, color: '#666' },
  statusMessage: { fontSize: 12, color: '#999', marginTop: 2 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  editInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    width: 80,
    backgroundColor: '#fff',
  },
  editSaveBtn: {
    backgroundColor: '#22C55E',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editSaveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  editCancelBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editCancelBtnText: { color: '#6B7280', fontSize: 14, fontWeight: '700' },
  adminActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  adminBtn: {
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  adminBtnText: { color: '#2563EB', fontSize: 12, fontWeight: '600' },
  adminBtnWarning: { borderColor: '#FDE68A' },
  adminBtnWarningText: { color: '#D97706', fontSize: 12, fontWeight: '600' },
});
