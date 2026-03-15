import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, StyleSheet, Linking } from 'react-native';
import type { ViewStyle } from 'react-native';
import {
  formatPrice,
  isEnterpriseTier,
  hasAnnualPricing,
  getSelectedPricing,
  computeAnnualDiscount,
} from '@wildwood/core';
import { useAppTier } from '../hooks/useAppTier';

export interface AppTierComponentProps {
  autoLoad?: boolean;
  showFeatures?: boolean;
  showLimits?: boolean;
  showBillingToggle?: boolean;
  preSelectedTierId?: string;
  enterpriseContactUrl?: string;
  currency?: string;
  /** When true, use selfSubscribe endpoint instead of admin changeTier */
  selfService?: boolean;
  onTierChanged?: (tierId: string) => void;
  style?: ViewStyle;
}

export function AppTierComponent({
  autoLoad = true,
  showFeatures = true,
  showLimits = true,
  showBillingToggle = true,
  preSelectedTierId,
  enterpriseContactUrl,
  currency = 'USD',
  selfService = false,
  onTierChanged,
  style,
}: AppTierComponentProps) {
  const { tiers, userSubscription, loading, error, getTiers, getUserSubscription, changeTier, selfSubscribe } =
    useAppTier();
  const [changeError, setChangeError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [billingAnnual, setBillingAnnual] = useState(false);

  const showToggle = showBillingToggle && hasAnnualPricing(tiers);

  const maxDiscount = useMemo(() => {
    let max = 0;
    for (const tier of tiers) {
      const d = computeAnnualDiscount(tier);
      if (d && d > max) max = d;
    }
    return max;
  }, [tiers]);

  useEffect(() => {
    if (autoLoad) {
      getTiers();
      getUserSubscription();
    }
  }, [autoLoad, getTiers, getUserSubscription]);

  const handleChangeTier = useCallback(
    async (tierId: string) => {
      setChangeError(null);
      setSuccessMessage('');
      try {
        const result = selfService ? await selfSubscribe(tierId) : await changeTier(tierId);
        if (result.success) {
          setSuccessMessage('Tier changed successfully');
          onTierChanged?.(tierId);
        } else {
          setChangeError(result.errorMessage ?? 'Tier change failed');
        }
      } catch (err) {
        setChangeError(err instanceof Error ? err.message : 'Tier change failed');
      }
    },
    [changeTier, selfSubscribe, selfService, onTierChanged],
  );

  const handleContactPress = useCallback((url: string) => {
    Linking.openURL(url).catch((err) => console.warn('Failed to open URL:', err));
  }, []);

  return (
    <ScrollView style={[styles.container, style]} contentContainerStyle={styles.contentContainer}>
      {/* Error alerts */}
      {error && (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{error}</Text>
        </View>
      )}
      {changeError && (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{changeError}</Text>
        </View>
      )}
      {successMessage !== '' && (
        <View style={styles.alertSuccess}>
          <Text style={styles.alertSuccessText}>{successMessage}</Text>
        </View>
      )}

      {/* Current subscription badge */}
      {userSubscription && (
        <View style={styles.currentTier}>
          <Text style={styles.currentTierLabel}>Current Tier</Text>
          <View style={styles.currentTierBadge}>
            <Text style={styles.currentTierName}>{userSubscription.tierName}</Text>
            {userSubscription.endDate && (
              <Text style={styles.currentTierExpiry}>
                {' '}
                Expires: {new Date(userSubscription.endDate).toLocaleDateString()}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Billing toggle */}
      {showToggle && (
        <View style={styles.billingToggleContainer}>
          <Text style={[styles.billingLabel, !billingAnnual && styles.billingLabelActive]}>Monthly</Text>
          <Pressable
            style={[styles.toggleTrack, billingAnnual && styles.toggleTrackOn]}
            onPress={() => setBillingAnnual(!billingAnnual)}
            accessibilityLabel="Toggle annual billing"
            accessibilityRole="switch"
          >
            <View style={[styles.toggleThumb, billingAnnual && styles.toggleThumbOn]} />
          </Pressable>
          <View style={styles.billingAnnualLabel}>
            <Text style={[styles.billingLabel, billingAnnual && styles.billingLabelActive]}>Annual</Text>
            {maxDiscount > 0 && (
              <View style={styles.discountBadge}>
                <Text style={styles.discountBadgeText}>Save {maxDiscount}%</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Loading state */}
      {loading && tiers.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading tiers...</Text>
        </View>
      ) : (
        /* Tier cards */
        <View style={styles.tierGrid}>
          {tiers.map((tier) => {
            const isCurrent = userSubscription?.appTierId === tier.id;
            const isPreSelected = preSelectedTierId === tier.id && !isCurrent;
            const enterprise = isEnterpriseTier(tier);
            const pricing = getSelectedPricing(tier, billingAnnual);
            const discount = billingAnnual ? computeAnnualDiscount(tier) : null;
            return (
              <View
                key={tier.id}
                style={[
                  styles.tierCard,
                  isCurrent && styles.tierCardCurrent,
                  isPreSelected && styles.tierCardPreSelected,
                ]}
              >
                {/* Badge */}
                {isPreSelected ? (
                  <View style={styles.preSelectedBadgeContainer}>
                    <Text style={styles.preSelectedBadgeText}>Your Selection</Text>
                  </View>
                ) : tier.customBadgeText && !isCurrent ? (
                  <View style={styles.badgeContainer}>
                    <Text style={styles.badgeText}>{tier.customBadgeText}</Text>
                  </View>
                ) : null}

                {/* Header */}
                <View style={styles.tierHeader}>
                  <Text style={styles.tierName}>{tier.name}</Text>
                  {tier.showPrice !== false &&
                    (enterprise ? (
                      <Text style={styles.tierPrice}>Custom</Text>
                    ) : tier.isFreeTier && !pricing ? (
                      <Text style={styles.tierPrice}>Free</Text>
                    ) : pricing ? (
                      <View>
                        <Text style={styles.tierPrice}>
                          {formatPrice(pricing.price, currency)}
                          {pricing.billingFrequency ? (
                            <Text style={styles.tierBillingFrequency}>/{pricing.billingFrequency.toLowerCase()}</Text>
                          ) : null}
                        </Text>
                        {discount ? (
                          <View style={styles.discountBadge}>
                            <Text style={styles.discountBadgeText}>Save {discount}%</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null)}
                </View>

                {/* Description */}
                {tier.description ? <Text style={styles.tierDescription}>{tier.description}</Text> : null}

                {/* Features list */}
                {showFeatures && tier.features && tier.features.length > 0 && (
                  <View style={styles.tierFeatures}>
                    {tier.features.map((f) => (
                      <View key={f.id} style={styles.featureRow}>
                        <Text style={[styles.featureIcon, !f.isEnabled && styles.featureIconDisabled]}>
                          {f.isEnabled ? '\u2713' : '\u2717'}
                        </Text>
                        <Text style={[styles.featureText, !f.isEnabled && styles.featureTextDisabled]}>
                          {f.displayName}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Limits */}
                {showLimits && tier.limits && tier.limits.length > 0 && (
                  <View style={styles.tierLimits}>
                    <Text style={styles.limitsHeading}>Limits</Text>
                    {tier.limits.map((l) => (
                      <View key={l.id} style={styles.limitRow}>
                        <Text style={styles.limitValue}>
                          {l.maxValue === -1 ? 'Unlimited' : l.maxValue.toLocaleString()}
                        </Text>
                        <Text style={styles.limitName}>
                          {l.displayName}
                          {l.unit ? ` (${l.unit})` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Footer */}
                <View style={styles.tierFooter}>
                  {isCurrent ? (
                    <View style={styles.currentPlanBadge}>
                      <Text style={styles.currentPlanBadgeText}>Current Plan</Text>
                    </View>
                  ) : tier.showContactButton && tier.contactButtonUrl ? (
                    <Pressable style={styles.contactButton} onPress={() => handleContactPress(tier.contactButtonUrl!)}>
                      <Text style={styles.contactButtonText}>Contact Us</Text>
                    </Pressable>
                  ) : enterprise && enterpriseContactUrl ? (
                    <Pressable style={styles.contactButton} onPress={() => handleContactPress(enterpriseContactUrl)}>
                      <Text style={styles.contactButtonText}>Contact Sales</Text>
                    </Pressable>
                  ) : enterprise ? (
                    <Pressable
                      style={styles.contactButton}
                      onPress={() => handleChangeTier(tier.id)}
                      disabled={loading}
                    >
                      <Text style={styles.contactButtonText}>Contact Sales</Text>
                    </Pressable>
                  ) : tier.showSubscribeButton !== false ? (
                    <Pressable
                      style={[
                        isPreSelected ? styles.selectButton : styles.selectButton,
                        loading && styles.buttonDisabled,
                      ]}
                      onPress={() => handleChangeTier(tier.id)}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.selectButtonText}>
                          {isPreSelected
                            ? 'Continue with This Plan'
                            : tier.isFreeTier
                              ? userSubscription
                                ? 'Get Started Free'
                                : 'Get Started'
                              : userSubscription
                                ? `Switch to ${tier.name}`
                                : 'Subscribe'}
                        </Text>
                      )}
                    </Pressable>
                  ) : null}
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

  // Current tier
  currentTier: {
    marginBottom: 16,
  },
  currentTierLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  currentTierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  currentTierName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  currentTierExpiry: {
    fontSize: 14,
    color: '#666',
  },

  // Billing toggle
  billingToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 10,
  },
  billingLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999',
  },
  billingLabelActive: {
    color: '#1a1a1a',
    fontWeight: '600',
  },
  billingAnnualLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ddd',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleTrackOn: {
    backgroundColor: '#007AFF',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },
  discountBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  discountBadgeText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '600',
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

  // Tier grid
  tierGrid: {
    gap: 16,
  },

  // Tier card
  tierCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  tierCardCurrent: {
    borderColor: '#22C55E',
    borderWidth: 2,
  },
  tierCardPreSelected: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },

  // Badge
  badgeContainer: {
    backgroundColor: '#007AFF',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  preSelectedBadgeContainer: {
    backgroundColor: '#007AFF',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  preSelectedBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Tier header
  tierHeader: {
    marginBottom: 12,
  },
  tierName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  tierPrice: {
    fontSize: 24,
    fontWeight: '700',
    color: '#007AFF',
  },
  tierBillingFrequency: {
    fontSize: 14,
    fontWeight: '400',
    color: '#666',
  },

  // Tier description
  tierDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },

  // Features list
  tierFeatures: {
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  featureIcon: {
    color: '#22C55E',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
    lineHeight: 20,
  },
  featureIconDisabled: {
    color: '#999',
  },
  featureText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    lineHeight: 20,
  },
  featureTextDisabled: {
    color: '#999',
  },

  // Limits
  tierLimits: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
    marginBottom: 12,
  },
  limitsHeading: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#999',
    marginBottom: 6,
  },
  limitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
  },
  limitValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#007AFF',
  },
  limitName: {
    fontSize: 13,
    color: '#666',
    textAlign: 'right',
    flex: 1,
    marginLeft: 8,
  },

  // Tier footer
  tierFooter: {
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

  // Contact button
  contactButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  contactButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },

  // Select button
  selectButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  selectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
