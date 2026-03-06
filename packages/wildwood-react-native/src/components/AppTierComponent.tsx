import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useAppTier } from '../hooks/useAppTier';

export interface AppTierComponentProps {
  autoLoad?: boolean;
  onTierChanged?: (tierId: string) => void;
}

export function AppTierComponent({
  autoLoad = true,
  onTierChanged,
}: AppTierComponentProps) {
  const { tiers, userSubscription, loading, error, getTiers, getUserSubscription, changeTier } = useAppTier();
  const [changeError, setChangeError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (autoLoad) {
      getTiers();
      getUserSubscription();
    }
  }, [autoLoad, getTiers, getUserSubscription]);

  const handleChangeTier = useCallback(async (tierId: string) => {
    setChangeError(null);
    setSuccessMessage('');
    try {
      const result = await changeTier(tierId);
      if (result.success) {
        setSuccessMessage('Tier changed successfully');
        onTierChanged?.(tierId);
      } else {
        setChangeError(result.errorMessage ?? 'Tier change failed');
      }
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : 'Tier change failed');
    }
  }, [changeTier, onTierChanged]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
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
                {' '}Expires: {new Date(userSubscription.endDate).toLocaleDateString()}
              </Text>
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
            const defaultPricing = tier.pricingOptions?.find((p) => p.isDefault) ?? tier.pricingOptions?.[0];
            return (
              <View
                key={tier.id}
                style={[styles.tierCard, isCurrent && styles.tierCardCurrent]}
              >
                {/* Header */}
                <View style={styles.tierHeader}>
                  <Text style={styles.tierName}>{tier.name}</Text>
                  {defaultPricing && (
                    <Text style={styles.tierPrice}>
                      ${defaultPricing.price}
                      {defaultPricing.billingFrequency ? (
                        <Text style={styles.tierBillingFrequency}>/{defaultPricing.billingFrequency}</Text>
                      ) : null}
                    </Text>
                  )}
                  {tier.isFreeTier && !defaultPricing && (
                    <Text style={styles.tierPrice}>Free</Text>
                  )}
                </View>

                {/* Description */}
                {tier.description ? (
                  <Text style={styles.tierDescription}>{tier.description}</Text>
                ) : null}

                {/* Features list */}
                {tier.features && tier.features.length > 0 && (
                  <View style={styles.tierFeatures}>
                    {tier.features.map((f) => (
                      <View key={f.id} style={styles.featureRow}>
                        <Text style={styles.featureCheck}>{'\u2713'}</Text>
                        <Text style={styles.featureText}>{f.displayName}</Text>
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
                  ) : (
                    <Pressable
                      style={[styles.selectButton, loading && styles.buttonDisabled]}
                      onPress={() => handleChangeTier(tier.id)}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.selectButtonText}>Select Plan</Text>
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
