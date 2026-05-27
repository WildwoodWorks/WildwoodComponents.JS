import { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { TierChangePreviewModel } from '@wildwood/core';

export interface TierChangeConfirmationModalProps {
  preview: TierChangePreviewModel;
  onConfirm: (options: { immediate: boolean; bypassPayment: boolean }) => void;
  onCancel: () => void;
  loading?: boolean;
}

function formatCurrency(amount: number | undefined | null, currency: string): string {
  if (amount == null) return '$0.00';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function TierChangeConfirmationModal({
  preview,
  onConfirm,
  onCancel,
  loading,
}: TierChangeConfirmationModalProps) {
  const [immediate, setImmediate] = useState(true);
  const [bypassPayment, setBypassPayment] = useState(false);

  const showPaymentBypass = preview.paymentBypassAllowed && preview.paymentRequired;
  const effectivePaymentRequired = preview.paymentRequired && !bypassPayment;
  const title = preview.isUpgrade ? `Upgrade to ${preview.newTierName}` : `Downgrade to ${preview.newTierName}`;

  const confirmLabel = loading
    ? 'Processing...'
    : bypassPayment
      ? 'Apply change (no charge)'
      : preview.isUpgrade && preview.proratedChargeToday
        ? `Upgrade for ${formatCurrency(preview.proratedChargeToday, preview.currency)}`
        : preview.isDowngrade
          ? 'Confirm Downgrade'
          : `Switch to ${preview.newTierName}`;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ScrollView>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Pressable onPress={onCancel} hitSlop={8}>
                <Text style={styles.close}>{'✕'}</Text>
              </Pressable>
            </View>

            {/* Plan comparison */}
            <View style={styles.comparison}>
              <View style={styles.plan}>
                <Text style={styles.planLabel}>Current</Text>
                <Text style={styles.planName}>{preview.currentTierName}</Text>
                {preview.currentPrice != null && (
                  <Text style={styles.planPrice}>
                    {formatCurrency(preview.currentPrice, preview.currency)}/
                    {preview.currentBillingFrequency?.toLowerCase() ?? 'mo'}
                  </Text>
                )}
              </View>
              <Text style={styles.arrow}>{'→'}</Text>
              <View style={styles.plan}>
                <Text style={styles.planLabel}>New</Text>
                <Text style={styles.planName}>{preview.newTierName}</Text>
                {preview.newPrice != null && (
                  <Text style={styles.planPrice}>
                    {formatCurrency(preview.newPrice, preview.currency)}/
                    {preview.newBillingFrequency?.toLowerCase() ?? 'mo'}
                  </Text>
                )}
              </View>
            </View>

            {/* Savings */}
            {preview.isBillingFrequencyChange &&
              preview.monthlyEquivalentCurrent != null &&
              preview.monthlyEquivalentNew != null &&
              preview.monthlyEquivalentNew < preview.monthlyEquivalentCurrent && (
                <View style={styles.savings}>
                  <Text style={styles.savingsText}>
                    Save{' '}
                    {Math.round(
                      ((preview.monthlyEquivalentCurrent - preview.monthlyEquivalentNew) /
                        preview.monthlyEquivalentCurrent) *
                        100,
                    )}
                    % — {formatCurrency(preview.monthlyEquivalentNew, preview.currency)}/mo billed{' '}
                    {preview.newBillingFrequency?.toLowerCase()}
                  </Text>
                </View>
              )}

            {/* Proration for upgrades */}
            {preview.isUpgrade && effectivePaymentRequired && preview.proratedChargeToday != null && (
              <View style={styles.chargeBox}>
                <Text style={styles.chargeHeader}>Today's charge</Text>
                {preview.creditAmount != null && preview.creditAmount > 0 && (
                  <View style={styles.lineItem}>
                    <Text style={styles.lineItemText}>Credit ({preview.daysRemainingInPeriod} unused days)</Text>
                    <Text style={styles.creditText}>-{formatCurrency(preview.creditAmount, preview.currency)}</Text>
                  </View>
                )}
                <View style={styles.lineItem}>
                  <Text style={styles.lineItemText}>
                    {preview.newTierName} ({preview.daysRemainingInPeriod} days)
                  </Text>
                  <Text style={styles.lineItemText}>
                    {formatCurrency((preview.proratedChargeToday ?? 0) + (preview.creditAmount ?? 0), preview.currency)}
                  </Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Net charge today</Text>
                  <Text style={styles.totalAmount}>
                    {formatCurrency(preview.proratedChargeToday, preview.currency)}
                  </Text>
                </View>
              </View>
            )}

            {/* Downgrade credit */}
            {preview.isDowngrade && preview.creditAmount != null && preview.creditAmount > 0 && (
              <View style={styles.creditInfo}>
                <Text style={styles.creditInfoText}>
                  {formatCurrency(preview.creditAmount, preview.currency)} credit will be applied to your next bill.
                </Text>
              </View>
            )}

            {/* Features gained */}
            {preview.featuresGained.length > 0 && (
              <View style={styles.featureSection}>
                <Text style={styles.featureLabel}>You'll gain:</Text>
                {preview.featuresGained.map((f) => (
                  <Text key={f} style={styles.featureGained}>
                    {'✓'} {f}
                  </Text>
                ))}
              </View>
            )}

            {/* Features lost */}
            {preview.featuresLost.length > 0 && (
              <View style={styles.featureSection}>
                <Text style={styles.featureLabel}>You'll lose access to:</Text>
                {preview.featuresLost.map((f) => (
                  <Text key={f} style={styles.featureLost}>
                    {'✗'} {f}
                  </Text>
                ))}
              </View>
            )}

            {/* Downgrade timing */}
            {preview.isDowngrade && preview.allowScheduledChange && (
              <View style={styles.timingSection}>
                <Text style={styles.timingLabel}>When should this take effect?</Text>
                <Pressable
                  style={[styles.timingOption, !immediate && styles.timingOptionSelected]}
                  onPress={() => setImmediate(false)}
                >
                  <View style={[styles.radio, !immediate && styles.radioSelected]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.timingTitle}>
                      End of billing period
                      {preview.nextBillingDate ? ` (${new Date(preview.nextBillingDate).toLocaleDateString()})` : ''}
                    </Text>
                    <Text style={styles.timingDesc}>Keep {preview.currentTierName} features until then.</Text>
                  </View>
                </Pressable>
                <Pressable
                  style={[styles.timingOption, immediate && styles.timingOptionSelected]}
                  onPress={() => setImmediate(true)}
                >
                  <View style={[styles.radio, immediate && styles.radioSelected]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.timingTitle}>Immediately</Text>
                    <Text style={styles.timingDesc}>Switch to {preview.newTierName} now.</Text>
                  </View>
                </Pressable>
              </View>
            )}

            {/* No payment provider warning */}
            {effectivePaymentRequired && !preview.paymentProviderAvailable && !preview.paymentBypassAllowed && (
              <View style={styles.warning}>
                <Text style={styles.warningText}>
                  Payment processing is not configured. Contact your administrator.
                </Text>
              </View>
            )}

            {/* Admin bypass */}
            {showPaymentBypass && (
              <Pressable style={styles.bypassRow} onPress={() => setBypassPayment(!bypassPayment)}>
                <View style={[styles.checkbox, bypassPayment && styles.checkboxChecked]}>
                  {bypassPayment && <Text style={styles.checkmark}>{'✓'}</Text>}
                </View>
                <Text style={styles.bypassText}>Bypass payment (admin override)</Text>
              </Pressable>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={loading}>
              <Text style={styles.cancelBtnText}>Keep Current Plan</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmBtn, preview.isUpgrade && styles.confirmBtnPrimary]}
              onPress={() => onConfirm({ immediate, bypassPayment })}
              disabled={
                loading ||
                (effectivePaymentRequired && !preview.paymentProviderAvailable && !preview.paymentBypassAllowed)
              }
            >
              <Text style={[styles.confirmBtnText, preview.isUpgrade && styles.confirmBtnTextPrimary]}>
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: '90%',
    width: '100%',
    maxWidth: 480,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 17, fontWeight: '600', color: '#111827' },
  close: { fontSize: 20, color: '#6b7280', paddingLeft: 8 },
  comparison: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 16,
    backgroundColor: '#f9fafb',
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 8,
  },
  plan: { alignItems: 'center', gap: 2 },
  planLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b7280' },
  planName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  planPrice: { fontSize: 13, color: '#374151' },
  arrow: { fontSize: 18, color: '#9ca3af' },
  savings: {
    backgroundColor: '#ecfdf5',
    marginHorizontal: 20,
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
  },
  savingsText: { fontSize: 13, fontWeight: '500', color: '#059669', textAlign: 'center' },
  chargeBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 20,
    marginTop: 12,
  },
  chargeHeader: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 },
  lineItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  lineItemText: { fontSize: 13, color: '#374151' },
  creditText: { fontSize: 13, color: '#059669' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 6,
    marginTop: 4,
  },
  totalLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  totalAmount: { fontSize: 14, fontWeight: '600', color: '#111827' },
  creditInfo: {
    backgroundColor: '#eff6ff',
    padding: 8,
    borderRadius: 6,
    marginHorizontal: 20,
    marginTop: 8,
  },
  creditInfoText: { fontSize: 13, color: '#2563eb' },
  featureSection: { marginHorizontal: 20, marginTop: 12, gap: 4 },
  featureLabel: { fontSize: 12, fontWeight: '600', color: '#374151' },
  featureGained: { fontSize: 13, color: '#059669' },
  featureLost: { fontSize: 13, color: '#dc2626' },
  timingSection: { marginHorizontal: 20, marginTop: 12, gap: 8 },
  timingLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  timingOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
  },
  timingOptionSelected: { borderColor: '#3b82f6' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#d1d5db', marginTop: 2 },
  radioSelected: { borderColor: '#3b82f6', backgroundColor: '#3b82f6' },
  timingTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  timingDesc: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  warning: {
    backgroundColor: '#fef3c7',
    padding: 8,
    borderRadius: 6,
    marginHorizontal: 20,
    marginTop: 8,
  },
  warningText: { fontSize: 13, color: '#92400e' },
  bypassRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 8,
    padding: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 6,
  },
  checkbox: { width: 18, height: 18, borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 3 },
  checkboxChecked: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  checkmark: { color: '#fff', fontSize: 12, textAlign: 'center', lineHeight: 16 },
  bypassText: { fontSize: 13, color: '#374151' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db' },
  cancelBtnText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  confirmBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db' },
  confirmBtnPrimary: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  confirmBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  confirmBtnTextPrimary: { color: '#fff' },
});
