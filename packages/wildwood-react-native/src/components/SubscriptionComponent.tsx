import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SubscriptionStatus } from '@wildwood/core';
import { useSubscription } from '../hooks/useSubscription';

export interface SubscriptionComponentProps {
  autoLoad?: boolean;
  onSubscriptionChange?: () => void;
}

export function SubscriptionComponent({
  autoLoad = true,
  onSubscriptionChange,
}: SubscriptionComponentProps) {
  const { plans, subscriptions, loading, error, getPlans, getUserSubscriptions, subscribe, cancelSubscription, changePlan } = useSubscription();
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const activeSubscription = subscriptions.find((s) => s.status === SubscriptionStatus.Active) ?? subscriptions[0] ?? null;

  useEffect(() => {
    if (autoLoad) {
      getPlans();
      getUserSubscriptions();
    }
  }, [autoLoad, getPlans, getUserSubscriptions]);

  const handleSubscribe = useCallback(async (planId: string) => {
    setActionError(null);
    setSuccessMessage('');
    try {
      const result = await subscribe(planId);
      if (result.isSuccess) {
        setSuccessMessage('Subscribed successfully!');
        onSubscriptionChange?.();
      } else {
        setActionError(result.errorMessage ?? 'Subscription failed');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Subscription failed');
    }
  }, [subscribe, onSubscriptionChange]);

  const handleCancel = useCallback(async () => {
    if (!activeSubscription) return;
    setActionError(null);
    setSuccessMessage('');
    try {
      const result = await cancelSubscription(activeSubscription.id);
      if (result.isSuccess) {
        setSuccessMessage('Subscription cancelled');
        onSubscriptionChange?.();
      } else {
        setActionError(result.errorMessage ?? 'Cancellation failed');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Cancellation failed');
    }
  }, [activeSubscription, cancelSubscription, onSubscriptionChange]);

  const handleChangePlan = useCallback(async (newPlanId: string) => {
    if (!activeSubscription) return;
    setActionError(null);
    setSuccessMessage('');
    try {
      const result = await changePlan(activeSubscription.id, newPlanId);
      if (result.isSuccess) {
        setSuccessMessage('Plan changed successfully!');
        onSubscriptionChange?.();
      } else {
        setActionError(result.errorMessage ?? 'Plan change failed');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Plan change failed');
    }
  }, [activeSubscription, changePlan, onSubscriptionChange]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Alerts */}
      {(error || actionError) && (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{error || actionError}</Text>
        </View>
      )}
      {successMessage !== '' && (
        <View style={styles.alertSuccess}>
          <Text style={styles.alertSuccessText}>{successMessage}</Text>
        </View>
      )}

      {/* Current Subscription */}
      {activeSubscription && (
        <View style={styles.currentSubscription}>
          <Text style={styles.sectionTitle}>Current Subscription</Text>
          <View style={[styles.card, styles.activeCard]}>
            <View style={styles.subscriptionInfo}>
              <Text style={styles.planNameText}>{activeSubscription.planName}</Text>
              <View style={[
                styles.badge,
                activeSubscription.status === SubscriptionStatus.Active ? styles.badgeSuccess : styles.badgeWarning,
              ]}>
                <Text style={[
                  styles.badgeText,
                  activeSubscription.status === SubscriptionStatus.Active ? styles.badgeSuccessText : styles.badgeWarningText,
                ]}>
                  {activeSubscription.status}
                </Text>
              </View>
            </View>
            {activeSubscription.nextBillingDate && (
              <Text style={styles.mutedText}>
                Renews: {new Date(activeSubscription.nextBillingDate).toLocaleDateString()}
              </Text>
            )}
            <Pressable
              style={[styles.dangerButton, loading && styles.buttonDisabled]}
              onPress={handleCancel}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.dangerButtonText}>Cancel Subscription</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {/* Available Plans */}
      {loading && plans.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading plans...</Text>
        </View>
      ) : (
        <View style={styles.planGrid}>
          {plans.map((plan) => {
            const isCurrentPlan = activeSubscription?.planId === plan.id;
            return (
              <View
                key={plan.id}
                style={[styles.card, isCurrentPlan && styles.cardCurrent]}
              >
                {/* Plan Header */}
                <View style={styles.planHeader}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planPrice}>
                    ${plan.price}
                    <Text style={styles.planInterval}>/{plan.billingInterval ?? 'month'}</Text>
                  </Text>
                </View>

                {/* Description */}
                {plan.description ? (
                  <Text style={styles.planDescription}>{plan.description}</Text>
                ) : null}

                {/* Features */}
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

                {/* Footer */}
                <View style={styles.planFooter}>
                  {isCurrentPlan ? (
                    <View style={styles.currentPlanBadge}>
                      <Text style={styles.currentPlanBadgeText}>Current Plan</Text>
                    </View>
                  ) : activeSubscription ? (
                    <Pressable
                      style={[styles.primaryButton, loading && styles.buttonDisabled]}
                      onPress={() => handleChangePlan(plan.id)}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Switch to this plan</Text>
                      )}
                    </Pressable>
                  ) : (
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
                  )}
                </View>
              </View>
            );
          })}
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

  // Current subscription
  currentSubscription: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  subscriptionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  planNameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  mutedText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },

  // Badges
  badge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeSuccess: {
    backgroundColor: '#DCFCE7',
  },
  badgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeSuccessText: {
    color: '#166534',
  },
  badgeWarningText: {
    color: '#92400E',
  },

  // Cards
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  activeCard: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  cardCurrent: {
    borderColor: '#22C55E',
    borderWidth: 2,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },

  // Plan grid
  planGrid: {
    gap: 16,
  },

  // Plan header
  planHeader: {
    marginBottom: 12,
  },
  planName: {
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

  // Plan description
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

  // Plan footer
  planFooter: {
    marginTop: 4,
  },

  // Current plan badge
  currentPlanBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  currentPlanBadgeText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '600',
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
  dangerButton: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    minHeight: 40,
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
