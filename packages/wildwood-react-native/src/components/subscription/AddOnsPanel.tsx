// AddOnsPanel - the native twin of @wildwood/react's subscription/admin/AddOnsPanel.
//
// A pack row says how it is paid for, because that decides what cancelling it does. A row with no
// payment behind it was GRANTED - a registration token's pack, or an admin's - so nothing bills it,
// there is no renewal to show and nothing to reactivate at a provider; cancelling one simply removes
// it. A billed row keeps access to the end of the period it is paid up to, and a cancellation
// scheduled that way can be taken back.
//
// The rules the rows follow are exported as plain functions: this package has no React renderer, so
// a rule is tested as the function the component calls.

import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierAddOnModel, UserAddOnSubscriptionModel } from '@wildwood/core';
import { formatMoney, trialLabel } from '@wildwood/core';
import { grantsAccess } from '@wildwood/react-shared';

/** Copy the panel lets a host replace. Anything left out keeps the shipped words. */
export interface AddOnsPanelLabels {
  /** Badge on a pack nothing bills. */
  included?: string;
  /** Confirmation copy before cancelling a pack nothing bills. */
  cancelIncluded?: string;
  /** Confirmation copy before cancelling a billed pack. */
  cancelBilled?: string;
  /** Confirms the cancellation. */
  cancelConfirm?: string;
  /** Backs out of it. */
  cancelKeep?: string;
  /** Takes back a scheduled cancellation. */
  reactivate?: string;
  /** Opens the host's pack picker. */
  addPacks?: string;
}

export const DEFAULT_ADDON_LABELS = {
  included: 'Included with your registration',
  cancelIncluded: 'This pack was included with your registration. Cancelling removes it from your account.',
  cancelBilled: 'You keep access until the end of the current billing period.',
  cancelConfirm: 'Cancel pack',
  cancelKeep: 'Keep pack',
  reactivate: 'Reactivate',
  addPacks: 'Add packs',
} satisfies Required<AddOnsPanelLabels>;

/** The parts of a pack subscription the row rules read. */
type AddOnRow = Pick<
  UserAddOnSubscriptionModel,
  'status' | 'isBundled' | 'paymentTransactionId' | 'endDate' | 'appTierAddOnId'
>;

/**
 * Granted, not sold: no payment behind the row and no plan bundling it in. Exactly the web's
 * predicate, because the same row has to read the same way on both.
 */
export function isComplimentaryAddOn(sub: Pick<AddOnRow, 'isBundled' | 'paymentTransactionId'>): boolean {
  return !sub.isBundled && !sub.paymentTransactionId;
}

/**
 * Whether the account already owns this pack. One access-granting rule for both lists: a row that is
 * Cancelled or Expired is on offer again, and one scheduled to cancel is still owned (so it is not
 * offered for purchase twice).
 */
export function ownsAddOn(subscriptions: readonly Pick<AddOnRow, 'status' | 'appTierAddOnId'>[], addOnId: string) {
  return subscriptions.some(
    (s) => s.appTierAddOnId?.toLowerCase() === addOnId?.toLowerCase() && grantsAccess(s.status),
  );
}

/** Which date line an owned row shows, if any. */
export type AddOnDateLine = 'renews' | 'cancels' | 'cancelsAtPeriodEnd' | 'none';

/** Everything an owned pack's row decides about itself. */
export interface AddOnRowRules {
  /** The row is scheduled to cancel at the end of the period. */
  cancelling: boolean;
  /** Nothing bills this row. */
  complimentary: boolean;
  /** The badge next to the name. */
  statusLabel: string;
  /** Which of the two date lines to show, or none - a granted pack promises no renewal. */
  dateLine: AddOnDateLine;
  /** A scheduled cancellation on a BILLED pack can be taken back. */
  offersReactivate: boolean;
  /** A cancel is only offered on a row that is not bundled and not already cancelling. */
  offersCancel: boolean;
  /** What the confirmation asks before the cancel is sent. */
  cancelMessage: string;
}

export function addOnRowRules(
  sub: AddOnRow,
  options: { canReactivate?: boolean; canCancel?: boolean; labels?: AddOnsPanelLabels } = {},
): AddOnRowRules {
  const copy = { ...DEFAULT_ADDON_LABELS, ...options.labels };
  const cancelling = sub.status === 'PendingCancellation';
  const complimentary = isComplimentaryAddOn(sub);
  // Nothing bills a granted pack, so there is no renewal date to promise.
  const showEndDate = !!sub.endDate && (cancelling || !complimentary);

  return {
    cancelling,
    complimentary,
    statusLabel: sub.isBundled ? 'Bundled' : cancelling ? 'Cancellation Scheduled' : sub.status,
    dateLine: showEndDate ? (cancelling ? 'cancels' : 'renews') : cancelling ? 'cancelsAtPeriodEnd' : 'none',
    offersReactivate: cancelling && !sub.isBundled && !complimentary && options.canReactivate === true,
    offersCancel: !sub.isBundled && !cancelling && options.canCancel === true,
    cancelMessage: complimentary ? copy.cancelIncluded : copy.cancelBilled,
  };
}

/**
 * What the row says when an action was refused or threw. A refusal carries no cause, so it gets the
 * fallback; a thrown error speaks for itself when it has anything to say.
 */
export function addOnFailureMessage(
  action: 'subscribe' | 'cancel' | 'reactivate',
  name: string | undefined,
  cause?: unknown,
): string {
  const verb = action === 'subscribe' ? 'subscribe to' : action;
  const fallback = `Could not ${verb} ${name ?? 'this pack'}. Please try again.`;
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

/** The trial the processor will actually start: the option that is bought, then the pack's own. */
export function addOnTrialLabel(
  addOn: Pick<AppTierAddOnModel, 'trialDays'>,
  pricing?: { trialDays?: number | null } | null,
): string {
  return trialLabel(pricing?.trialDays ?? addOn.trialDays);
}

export interface AddOnsPanelProps {
  addOns: AppTierAddOnModel[];
  subscriptions: UserAddOnSubscriptionModel[];
  currentTierId?: string;
  loading?: boolean;
  /** Fallback currency for a pack that does not carry its own. */
  currency?: string;
  /**
   * Subscribe to a pack. Resolve `false` (or reject) to report the failure: the panel surfaces it
   * inline instead of looking as if the purchase went through.
   *
   * Left out, no pack offers a one-click Subscribe: a surface that takes a card of its own offers
   * {@link AddOnsPanelProps.onAddPacks} instead.
   */
  onSubscribe?: (addOnId: string, pricingId?: string) => Promise<boolean | void>;
  /**
   * Cancel a pack subscription. Asked for twice - the row asks the user to confirm first, in the
   * words that fit how the pack is paid for. Resolve `false` (or reject) to report the failure.
   */
  onCancel?: (subscriptionId: string) => Promise<boolean | void>;
  /** Take back a scheduled cancellation. Only ever offered on a billed pack. */
  onReactivate?: (subscriptionId: string) => Promise<boolean | void>;
  /** Open the host's own pack picker. Given one, the panel offers "Add packs". */
  onAddPacks?: () => void;
  labels?: AddOnsPanelLabels;
  style?: ViewStyle;
}

export function AddOnsPanel({
  addOns,
  subscriptions,
  currentTierId,
  loading,
  currency = 'USD',
  onSubscribe,
  onCancel,
  onReactivate,
  onAddPacks,
  labels,
  style,
}: AddOnsPanelProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  // Failure of the last subscribe/cancel/reactivate attempt. Cleared when the next attempt starts,
  // so a retry never shows a stale message.
  const [actionError, setActionError] = useState<string | null>(null);
  // The row whose cancellation is being confirmed. Nothing is cancelled on the first press.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Which of the two row actions is in flight, so the row says what it is doing.
  const [processingAction, setProcessingAction] = useState<'cancel' | 'reactivate'>('cancel');
  const copy = { ...DEFAULT_ADDON_LABELS, ...labels };

  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const isBundled = (addOn: AppTierAddOnModel) =>
    currentTierId ? addOn.bundledInTierIds?.some((id) => id?.toLowerCase() === currentTierId?.toLowerCase()) : false;

  const handleSubscribe = async (addOn: AppTierAddOnModel, pricingId?: string) => {
    setActionError(null);
    setProcessingId(addOn.id);
    try {
      const result = await onSubscribe?.(addOn.id, pricingId);
      if (result === false) setActionError(addOnFailureMessage('subscribe', addOn.name));
    } catch (err: unknown) {
      setActionError(addOnFailureMessage('subscribe', addOn.name, err));
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (sub: UserAddOnSubscriptionModel) => {
    setActionError(null);
    setConfirmingId(null);
    setProcessingAction('cancel');
    setProcessingId(sub.id);
    try {
      const result = await onCancel?.(sub.id);
      if (result === false) setActionError(addOnFailureMessage('cancel', sub.addOnName));
    } catch (err: unknown) {
      setActionError(addOnFailureMessage('cancel', sub.addOnName, err));
    } finally {
      setProcessingId(null);
    }
  };

  const handleReactivate = async (sub: UserAddOnSubscriptionModel) => {
    setActionError(null);
    setProcessingAction('reactivate');
    setProcessingId(sub.id);
    try {
      const result = await onReactivate?.(sub.id);
      if (result === false) setActionError(addOnFailureMessage('reactivate', sub.addOnName));
    } catch (err: unknown) {
      setActionError(addOnFailureMessage('reactivate', sub.addOnName, err));
    } finally {
      setProcessingId(null);
    }
  };

  const activeAddOns = subscriptions.filter((s) => grantsAccess(s.status));
  const availableAddOns = addOns.filter((a) => !ownsAddOn(subscriptions, a.id));

  return (
    <View style={[styles.container, style]}>
      {actionError ? (
        <View style={styles.alertDanger} accessibilityRole="alert">
          <Text style={styles.alertDangerText}>{actionError}</Text>
        </View>
      ) : null}

      {onAddPacks ? (
        <Pressable testID="add-packs" style={styles.addPacksBtn} onPress={onAddPacks}>
          <Text style={styles.addPacksBtnText}>{copy.addPacks}</Text>
        </Pressable>
      ) : null}

      {/* Active */}
      {activeAddOns.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Add-Ons</Text>
          <View style={styles.grid}>
            {activeAddOns.map((sub) => {
              const rules = addOnRowRules(sub, {
                canReactivate: !!onReactivate,
                canCancel: !!onCancel,
                labels,
              });
              return (
                <View key={sub.id} style={[styles.card, styles.cardActive]}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardName}>{sub.addOnName}</Text>
                    <View
                      style={[
                        styles.badge,
                        sub.isBundled ? styles.badgeInfo : rules.cancelling ? styles.badgeWarning : styles.badgeSuccess,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          sub.isBundled
                            ? styles.badgeInfoText
                            : rules.cancelling
                              ? styles.badgeWarningText
                              : styles.badgeSuccessText,
                        ]}
                      >
                        {rules.statusLabel}
                      </Text>
                    </View>
                  </View>
                  {rules.complimentary ? (
                    <View style={[styles.badge, styles.badgeInfo]}>
                      <Text style={[styles.badgeText, styles.badgeInfoText]}>{copy.included}</Text>
                    </View>
                  ) : null}
                  {sub.addOnDescription ? <Text style={styles.mutedText}>{sub.addOnDescription}</Text> : null}
                  <Text style={styles.dateText}>
                    Started: {new Date(sub.startDate).toLocaleDateString()}
                    {rules.dateLine === 'renews' ? ` | Renews: ${new Date(sub.endDate!).toLocaleDateString()}` : ''}
                    {rules.dateLine === 'cancels'
                      ? ` | Cancels on: ${new Date(sub.endDate!).toLocaleDateString()}`
                      : ''}
                    {rules.dateLine === 'cancelsAtPeriodEnd' ? ' | Cancels at the end of the billing period' : ''}
                  </Text>

                  {processingId === sub.id ? (
                    <Text style={styles.mutedText}>
                      {processingAction === 'reactivate' ? 'Reactivating...' : 'Cancelling...'}
                    </Text>
                  ) : (
                    <>
                      {rules.offersReactivate ? (
                        <Pressable style={styles.outlineBtn} onPress={() => handleReactivate(sub)}>
                          <Text style={styles.outlineBtnText}>{copy.reactivate}</Text>
                        </Pressable>
                      ) : null}
                      {rules.offersCancel ? (
                        confirmingId === sub.id ? (
                          <View style={styles.confirmRow}>
                            <Text style={styles.confirmMessage}>{rules.cancelMessage}</Text>
                            <View style={styles.confirmActions}>
                              <Pressable style={styles.confirmYes} onPress={() => handleCancel(sub)}>
                                <Text style={styles.confirmYesText}>{copy.cancelConfirm}</Text>
                              </Pressable>
                              <Pressable style={styles.confirmNo} onPress={() => setConfirmingId(null)}>
                                <Text style={styles.confirmNoText}>{copy.cancelKeep}</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : (
                          <Pressable style={styles.cancelBtn} onPress={() => setConfirmingId(sub.id)}>
                            <Text style={styles.cancelBtnText}>Cancel</Text>
                          </Pressable>
                        )
                      ) : null}
                    </>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Available */}
      {availableAddOns.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Add-Ons</Text>
          <View style={styles.grid}>
            {availableAddOns.map((addOn) => {
              const bundled = isBundled(addOn);
              const pricing = addOn.pricingOptions?.find((p) => p.isDefault) ?? addOn.pricingOptions?.[0];
              const trial = addOnTrialLabel(addOn, pricing);

              return (
                <View key={addOn.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardName}>{addOn.name}</Text>
                    {addOn.category ? (
                      <View style={[styles.badge, styles.badgeSecondary]}>
                        <Text style={[styles.badgeText, styles.badgeSecondaryText]}>{addOn.category}</Text>
                      </View>
                    ) : null}
                  </View>
                  {addOn.description ? <Text style={styles.mutedText}>{addOn.description}</Text> : null}
                  {addOn.features?.length > 0 ? (
                    <View style={styles.featuresList}>
                      {addOn.features.map((f) => (
                        <View key={f.id} style={styles.featureRow}>
                          <Text style={styles.featureCheck}>{'✓'}</Text>
                          <Text style={styles.featureName}>{f.displayName}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {pricing ? (
                    <Text style={styles.priceText}>
                      {formatMoney(pricing.price, addOn.currency ?? currency)}/
                      {pricing.billingFrequency?.toLowerCase() ?? 'month'}
                    </Text>
                  ) : null}
                  {trial ? <Text style={styles.trialText}>{trial}</Text> : null}
                  <View style={styles.cardFooter}>
                    {bundled ? (
                      <View style={[styles.badge, styles.badgeInfo]}>
                        <Text style={[styles.badgeText, styles.badgeInfoText]}>Included in Plan</Text>
                      </View>
                    ) : null}
                    {/* No one-click purchase without a handler: the button did nothing at all when
                        the surface buys packs through a checkout of its own instead. */}
                    {!bundled && onSubscribe ? (
                      <Pressable
                        style={[styles.subscribeBtn, processingId === addOn.id && styles.buttonDisabled]}
                        onPress={() => handleSubscribe(addOn, pricing?.id)}
                        disabled={processingId === addOn.id}
                      >
                        <Text style={styles.subscribeBtnText}>
                          {processingId === addOn.id ? 'Subscribing...' : 'Subscribe'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {!activeAddOns.length && !availableAddOns.length ? (
        <View style={styles.alertInfo}>
          <Text style={styles.alertInfoText}>No add-ons available.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  loadingText: { marginTop: 8, fontSize: 14, color: '#666', textAlign: 'center' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  grid: { gap: 10 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
    gap: 8,
  },
  cardActive: { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a', flex: 1 },
  mutedText: { fontSize: 13, color: '#666' },
  dateText: { fontSize: 12, color: '#999' },
  featuresList: { gap: 4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  featureCheck: { color: '#22C55E', fontSize: 14, fontWeight: '700' },
  featureName: { fontSize: 13, color: '#333' },
  priceText: { fontSize: 15, fontWeight: '700', color: '#007AFF' },
  trialText: { fontSize: 12, color: '#999' },
  cardFooter: { marginTop: 4, gap: 8 },
  badge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeSuccess: { backgroundColor: '#DCFCE7' },
  badgeSuccessText: { color: '#166534' },
  badgeInfo: { backgroundColor: '#DBEAFE' },
  badgeInfoText: { color: '#1D4ED8' },
  badgeWarning: { backgroundColor: '#FEF3C7' },
  badgeWarningText: { color: '#92400E' },
  badgeSecondary: { backgroundColor: '#F3F4F6' },
  badgeSecondaryText: { color: '#6B7280' },
  alertDanger: { backgroundColor: '#FEE2E2', borderRadius: 8, padding: 12 },
  alertDangerText: { color: '#991B1B', fontSize: 14 },
  addPacksBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  addPacksBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  cancelBtn: {
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  cancelBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },
  outlineBtn: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  outlineBtnText: { color: '#007AFF', fontSize: 13, fontWeight: '600' },
  confirmRow: {
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  confirmMessage: { fontSize: 13, color: '#92400E' },
  confirmActions: { flexDirection: 'row', gap: 8 },
  confirmYes: { backgroundColor: '#EF4444', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  confirmYesText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  confirmNo: { backgroundColor: '#F3F4F6', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  confirmNoText: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  subscribeBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  subscribeBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
  alertInfo: { backgroundColor: '#DBEAFE', borderRadius: 8, padding: 12 },
  alertInfoText: { color: '#1D4ED8', fontSize: 14 },
});
