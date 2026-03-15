import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { UserTierSubscriptionModel } from '@wildwood/core';

export interface SubscriptionStatusPanelProps {
  subscription: UserTierSubscriptionModel | null;
  loading?: boolean;
  onCancelRequested?: () => Promise<void>;
  style?: ViewStyle;
}

const STATUS_COLORS: Record<string, string> = {
  Active: '#22C55E',
  Trialing: '#3B82F6',
  PastDue: '#F59E0B',
  Cancelled: '#EF4444',
  Expired: '#999',
};

export function SubscriptionStatusPanel({
  subscription,
  loading,
  onCancelRequested,
  style,
}: SubscriptionStatusPanelProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!subscription) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.alertInfo}>
          <Text style={styles.alertInfoText}>No active subscription found.</Text>
        </View>
      </View>
    );
  }

  const handleConfirmCancel = async () => {
    setCancelling(true);
    try {
      await onCancelRequested?.();
      setShowCancelConfirm(false);
    } finally {
      setCancelling(false);
    }
  };

  const statusColor = STATUS_COLORS[subscription.status] ?? '#999';

  return (
    <View style={[styles.container, style]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.tierName}>{subscription.tierName}</Text>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: statusColor + '22' }]}>
              <Text style={[styles.badgeText, { color: statusColor }]}>{subscription.status}</Text>
            </View>
            {subscription.isFreeTier ? (
              <View style={[styles.badge, { backgroundColor: '#F3F4F6' }]}>
                <Text style={[styles.badgeText, { color: '#6B7280' }]}>Free</Text>
              </View>
            ) : null}
          </View>
        </View>
        {!subscription.isFreeTier && subscription.status === 'Active' && onCancelRequested ? (
          <Pressable style={styles.cancelButton} onPress={() => setShowCancelConfirm(true)}>
            <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Description */}
      {subscription.tierDescription ? <Text style={styles.description}>{subscription.tierDescription}</Text> : null}

      {/* Date fields */}
      <View style={styles.dateFields}>
        <View style={styles.dateCard}>
          <Text style={styles.dateLabel}>Start Date</Text>
          <Text style={styles.dateValue}>{new Date(subscription.startDate).toLocaleDateString()}</Text>
        </View>
        {subscription.currentPeriodEnd ? (
          <View style={styles.dateCard}>
            <Text style={styles.dateLabel}>Current Period Ends</Text>
            <Text style={styles.dateValue}>{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</Text>
          </View>
        ) : null}
        {subscription.trialEndDate ? (
          <View style={styles.dateCard}>
            <Text style={styles.dateLabel}>Trial Ends</Text>
            <Text style={styles.dateValue}>{new Date(subscription.trialEndDate).toLocaleDateString()}</Text>
          </View>
        ) : null}
      </View>

      {/* Pending change */}
      {subscription.pendingTierName ? (
        <View style={styles.pendingNotice}>
          <Text style={styles.pendingText}>
            Pending change to <Text style={styles.pendingBold}>{subscription.pendingTierName}</Text>
            {subscription.pendingChangeDate
              ? ` on ${new Date(subscription.pendingChangeDate).toLocaleDateString()}`
              : ''}
          </Text>
        </View>
      ) : null}

      {/* Cancel confirmation modal */}
      <Modal visible={showCancelConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Cancel Subscription</Text>
            <Text style={styles.modalBody}>
              Are you sure you want to cancel the <Text style={{ fontWeight: '700' }}>{subscription.tierName}</Text>{' '}
              subscription?
            </Text>
            {subscription.currentPeriodEnd ? (
              <Text style={styles.modalMuted}>
                Access will continue until {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.outlineButton} onPress={() => setShowCancelConfirm(false)} disabled={cancelling}>
                <Text style={styles.outlineButtonText}>Keep Subscription</Text>
              </Pressable>
              <Pressable
                style={[styles.dangerButton, cancelling && styles.buttonDisabled]}
                onPress={handleConfirmCancel}
                disabled={cancelling}
              >
                <Text style={styles.dangerButtonText}>{cancelling ? 'Cancelling...' : 'Confirm Cancellation'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  loadingText: { marginTop: 8, fontSize: 14, color: '#666', textAlign: 'center' },
  alertInfo: { backgroundColor: '#DBEAFE', borderRadius: 8, padding: 12 },
  alertInfoText: { color: '#1D4ED8', fontSize: 14 },
  header: { gap: 8 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierName: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  badges: { flexDirection: 'row', gap: 6 },
  badge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  cancelButtonText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },
  description: { fontSize: 14, color: '#666', lineHeight: 20 },
  dateFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    minWidth: 140,
    flex: 1,
  },
  dateLabel: { fontSize: 11, fontWeight: '600', color: '#999', textTransform: 'uppercase', marginBottom: 4 },
  dateValue: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  pendingNotice: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 12,
  },
  pendingText: { color: '#92400E', fontSize: 14 },
  pendingBold: { fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  modalBody: { fontSize: 14, color: '#333', lineHeight: 20 },
  modalMuted: { fontSize: 13, color: '#999' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  outlineButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  outlineButtonText: { color: '#333', fontSize: 14, fontWeight: '600' },
  dangerButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
});
