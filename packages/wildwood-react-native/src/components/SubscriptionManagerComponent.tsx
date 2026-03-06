import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Modal,
} from 'react-native';
import type { Subscription } from '@wildwood/core';
import { SubscriptionStatus } from '@wildwood/core';
import { useSubscription } from '../hooks/useSubscription';

export interface SubscriptionManagerComponentProps {
  autoLoad?: boolean;
  showPlanSelector?: boolean;
  onSubscriptionChange?: (subscription: Subscription) => void;
}

/**
 * Full subscription management component - shows all subscriptions, history,
 * and plan management. More comprehensive than SubscriptionComponent.
 */
export function SubscriptionManagerComponent({
  autoLoad = true,
  showPlanSelector = true,
  onSubscriptionChange,
}: SubscriptionManagerComponentProps) {
  const {
    plans, subscriptions, loading, error,
    getPlans, getUserSubscriptions, getSubscription,
    subscribe, cancelSubscription, changePlan,
  } = useSubscription();

  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ action: string; id: string } | null>(null);

  useEffect(() => {
    if (autoLoad) {
      getPlans();
      getUserSubscriptions();
    }
  }, [autoLoad, getPlans, getUserSubscriptions]);

  const handleViewDetails = useCallback(async (subscriptionId: string) => {
    const sub = await getSubscription(subscriptionId);
    setSelectedSubscription(sub);
  }, [getSubscription]);

  const handleSubscribe = useCallback(async (planId: string) => {
    setActionMessage(null);
    try {
      const result = await subscribe(planId);
      if (result.isSuccess) {
        setActionMessage({ type: 'success', text: 'Subscribed successfully!' });
      } else {
        setActionMessage({ type: 'error', text: result.errorMessage ?? 'Failed to subscribe' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to subscribe' });
    }
    setConfirmAction(null);
  }, [subscribe]);

  const handleCancel = useCallback(async (subscriptionId: string) => {
    setActionMessage(null);
    try {
      const result = await cancelSubscription(subscriptionId);
      if (result.isSuccess) {
        setActionMessage({ type: 'success', text: 'Subscription cancelled' });
        onSubscriptionChange?.(subscriptions.find((s) => s.id === subscriptionId)!);
      } else {
        setActionMessage({ type: 'error', text: result.errorMessage ?? 'Failed to cancel' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to cancel' });
    }
    setConfirmAction(null);
  }, [cancelSubscription, subscriptions, onSubscriptionChange]);

  const handleChangePlan = useCallback(async (subscriptionId: string, newPlanId: string) => {
    setActionMessage(null);
    try {
      const result = await changePlan(subscriptionId, newPlanId);
      if (result.isSuccess) {
        setActionMessage({ type: 'success', text: 'Plan changed successfully!' });
      } else {
        setActionMessage({ type: 'error', text: result.errorMessage ?? 'Failed to change plan' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to change plan' });
    }
  }, [changePlan]);

  const getStatusBadgeStyle = (status: SubscriptionStatus) => {
    switch (status) {
      case SubscriptionStatus.Active: return styles.badgeSuccess;
      case SubscriptionStatus.Cancelled: return styles.badgeDanger;
      case SubscriptionStatus.PendingPayment: return styles.badgeWarning;
      default: return styles.badgeSecondary;
    }
  };

  const getStatusBadgeTextStyle = (status: SubscriptionStatus) => {
    switch (status) {
      case SubscriptionStatus.Active: return styles.badgeSuccessText;
      case SubscriptionStatus.Cancelled: return styles.badgeDangerText;
      case SubscriptionStatus.PendingPayment: return styles.badgeWarningText;
      default: return styles.badgeSecondaryText;
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Error alert */}
      {(error || actionMessage?.type === 'error') && (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{error || actionMessage?.text}</Text>
        </View>
      )}
      {actionMessage?.type === 'success' && (
        <View style={styles.alertSuccess}>
          <Text style={styles.alertSuccessText}>{actionMessage.text}</Text>
        </View>
      )}

      {/* Subscription List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Subscriptions</Text>
        {loading && subscriptions.length === 0 && (
          <Text style={styles.mutedText}>Loading...</Text>
        )}
        {!loading && subscriptions.length === 0 && (
          <Text style={styles.mutedText}>No subscriptions found.</Text>
        )}
        {subscriptions.map((sub) => (
          <View key={sub.id} style={styles.card}>
            <View style={styles.subscriptionInfo}>
              <View style={styles.subscriptionHeader}>
                <Text style={styles.planNameText}>{sub.planName}</Text>
                <View style={[styles.badge, getStatusBadgeStyle(sub.status)]}>
                  <Text style={[styles.badgeText, getStatusBadgeTextStyle(sub.status)]}>
                    {sub.status}
                  </Text>
                </View>
              </View>
              {sub.startDate && (
                <Text style={styles.smallMutedText}>
                  Since {new Date(sub.startDate).toLocaleDateString()}
                </Text>
              )}
              {sub.nextBillingDate && (
                <Text style={styles.smallMutedText}>
                  Next billing: {new Date(sub.nextBillingDate).toLocaleDateString()}
                </Text>
              )}
            </View>
            <View style={styles.subscriptionActions}>
              <Pressable
                style={styles.outlineButton}
                onPress={() => handleViewDetails(sub.id)}
              >
                <Text style={styles.outlineButtonText}>Details</Text>
              </Pressable>
              {sub.status === SubscriptionStatus.Active && (
                <Pressable
                  style={styles.dangerButtonSmall}
                  onPress={() => setConfirmAction({ action: 'cancel', id: sub.id })}
                >
                  <Text style={styles.dangerButtonSmallText}>Cancel</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* Confirm Dialog */}
      <Modal
        visible={confirmAction !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmAction(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Confirm {confirmAction?.action === 'cancel' ? 'Cancellation' : 'Action'}
            </Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to {confirmAction?.action} this subscription?
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.dangerButton, loading && styles.buttonDisabled]}
                onPress={() => {
                  if (confirmAction?.action === 'cancel') handleCancel(confirmAction.id);
                }}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.dangerButtonText}>Confirm</Text>
                )}
              </Pressable>
              <Pressable
                style={styles.outlineButton}
                onPress={() => setConfirmAction(null)}
              >
                <Text style={styles.outlineButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Subscription Details */}
      {selectedSubscription && (
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>Subscription Details</Text>
          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Plan</Text>
              <Text style={styles.detailValue}>{selectedSubscription.planName}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status</Text>
              <View style={[styles.badge, getStatusBadgeStyle(selectedSubscription.status)]}>
                <Text style={[styles.badgeText, getStatusBadgeTextStyle(selectedSubscription.status)]}>
                  {selectedSubscription.status}
                </Text>
              </View>
            </View>
            {selectedSubscription.startDate && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Period Start</Text>
                <Text style={styles.detailValue}>
                  {new Date(selectedSubscription.startDate).toLocaleDateString()}
                </Text>
              </View>
            )}
            {selectedSubscription.endDate && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Period End</Text>
                <Text style={styles.detailValue}>
                  {new Date(selectedSubscription.endDate).toLocaleDateString()}
                </Text>
              </View>
            )}
            {selectedSubscription.nextBillingDate && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Next Billing</Text>
                <Text style={styles.detailValue}>
                  {new Date(selectedSubscription.nextBillingDate).toLocaleDateString()}
                </Text>
              </View>
            )}

            {/* Plan Change */}
            {selectedSubscription.status === SubscriptionStatus.Active && showPlanSelector && plans.length > 1 && (
              <View style={styles.planChangeSection}>
                <Text style={styles.planChangeTitle}>Change Plan</Text>
                {plans
                  .filter((p) => p.id !== selectedSubscription.planId)
                  .map((plan) => (
                    <View key={plan.id} style={styles.planOption}>
                      <Text style={styles.planOptionText}>
                        {plan.name} - ${plan.price}/{plan.billingInterval ?? 'month'}
                      </Text>
                      <Pressable
                        style={[styles.primaryButtonSmall, loading && styles.buttonDisabled]}
                        onPress={() => handleChangePlan(selectedSubscription.id, plan.id)}
                        disabled={loading}
                      >
                        {loading ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.primaryButtonSmallText}>Switch</Text>
                        )}
                      </Pressable>
                    </View>
                  ))}
              </View>
            )}

            <Pressable
              style={[styles.outlineButton, { marginTop: 16 }]}
              onPress={() => setSelectedSubscription(null)}
            >
              <Text style={styles.outlineButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Available Plans (for new subscriptions) */}
      {showPlanSelector && subscriptions.length === 0 && plans.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Plans</Text>
          <View style={styles.planGrid}>
            {plans.map((plan) => (
              <View key={plan.id} style={styles.card}>
                {/* Plan Header */}
                <View style={styles.planHeader}>
                  <Text style={styles.planCardName}>{plan.name}</Text>
                  <Text style={styles.planPrice}>
                    ${plan.price}
                    <Text style={styles.planInterval}>/{plan.billingInterval ?? 'month'}</Text>
                  </Text>
                </View>
                {plan.description ? (
                  <Text style={styles.planDescription}>{plan.description}</Text>
                ) : null}
                {plan.features && plan.features.length > 0 && (
                  <View style={styles.featuresList}>
                    {plan.features.map((f, i) => (
                      <View key={i} style={styles.featureRow}>
                        <Text style={styles.featureCheck}>{'\u2713'}</Text>
                        <Text style={styles.featureText}>{f}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Pressable
                  style={[styles.primaryButton, loading && styles.buttonDisabled]}
                  onPress={() => handleSubscribe(plan.id)}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Subscribe</Text>
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },

  // Alerts
  alertError: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  alertErrorText: {
    color: '#991B1B',
    fontSize: 14,
  },
  alertSuccess: {
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#22C55E',
  },
  alertSuccessText: {
    color: '#166534',
    fontSize: 14,
  },

  // Sections
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },

  // Subscription info
  subscriptionInfo: {
    marginBottom: 12,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  planNameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  mutedText: {
    fontSize: 14,
    color: '#666',
  },
  smallMutedText: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },

  // Subscription actions
  subscriptionActions: {
    flexDirection: 'row',
    gap: 8,
  },

  // Badges
  badge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeSuccess: {
    backgroundColor: '#DCFCE7',
  },
  badgeSuccessText: {
    color: '#166534',
  },
  badgeDanger: {
    backgroundColor: '#FEE2E2',
  },
  badgeDangerText: {
    color: '#991B1B',
  },
  badgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  badgeWarningText: {
    color: '#92400E',
  },
  badgeSecondary: {
    backgroundColor: '#F3F4F6',
  },
  badgeSecondaryText: {
    color: '#6B7280',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },

  // Details section
  detailsSection: {
    marginBottom: 24,
  },
  detailCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    color: '#1a1a1a',
  },

  // Plan change
  planChangeSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  planChangeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  planOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  planOptionText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    marginRight: 12,
  },

  // Plan grid
  planGrid: {
    gap: 16,
  },
  planHeader: {
    marginBottom: 12,
  },
  planCardName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: '700',
    color: '#007AFF',
  },
  planInterval: {
    fontSize: 14,
    fontWeight: '400',
    color: '#666',
  },
  planDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },

  // Features
  featuresList: {
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  featureCheck: {
    color: '#22C55E',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
    lineHeight: 20,
  },
  featureText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    lineHeight: 20,
  },

  // Buttons
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButtonSmall: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonSmallText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  dangerButtonSmall: {
    backgroundColor: '#EF4444',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonSmallText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  outlineButtonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
