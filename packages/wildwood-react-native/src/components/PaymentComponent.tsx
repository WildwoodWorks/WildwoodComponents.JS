import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Linking,
} from 'react-native';
import type { AppPaymentConfigurationDto, SavedPaymentMethodDto } from '@wildwood/core';
import { usePayment } from '../hooks/usePayment';

export interface PaymentComponentProps {
  customerId?: string;
  onPaymentComplete?: (paymentIntentId: string) => void;
}

export function PaymentComponent({
  customerId,
  onPaymentComplete,
}: PaymentComponentProps) {
  const {
    loading, error, savedMethods,
    getAppPaymentConfiguration,
    initiatePayment, getSavedPaymentMethods,
    deleteSavedPaymentMethod, setDefaultPaymentMethod,
  } = usePayment();

  const [config, setConfig] = useState<AppPaymentConfigurationDto | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      const appConfig = await getAppPaymentConfiguration();
      if (appConfig) setConfig(appConfig);
      if (customerId) {
        await getSavedPaymentMethods(customerId);
      }
    };
    load();
  }, [getAppPaymentConfiguration, getSavedPaymentMethods, customerId]);

  const handlePay = useCallback(async () => {
    setPaymentError(null);
    setSuccessMessage('');

    if (!amount || parseFloat(amount) <= 0) {
      setPaymentError('Please enter a valid amount');
      return;
    }

    if (!config?.defaultProviderId) {
      setPaymentError('No payment provider configured');
      return;
    }

    try {
      const result = await initiatePayment({
        providerId: config.defaultProviderId,
        appId: config.appId,
        amount: parseFloat(amount),
        currency: config.defaultCurrency ?? 'USD',
        description: description || undefined,
        customerId: customerId || undefined,
      });

      if (result.success) {
        if (result.redirectUrl) {
          const url = result.redirectUrl.startsWith('http')
            ? result.redirectUrl
            : `https://${result.redirectUrl}`;
          await Linking.openURL(url);
        } else {
          setSuccessMessage('Payment initiated successfully!');
          setAmount('');
          setDescription('');
          onPaymentComplete?.(result.paymentIntentId ?? '');
        }
      } else {
        setPaymentError(result.errorMessage ?? 'Payment failed');
      }
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Payment failed');
    }
  }, [amount, config, description, customerId, initiatePayment, onPaymentComplete]);

  const handleDeleteMethod = useCallback(async (methodId: string) => {
    await deleteSavedPaymentMethod(methodId);
    if (selectedMethod === methodId) setSelectedMethod(null);
    if (customerId) await getSavedPaymentMethods(customerId);
  }, [deleteSavedPaymentMethod, selectedMethod, getSavedPaymentMethods, customerId]);

  const handleSetDefault = useCallback(async (methodId: string) => {
    await setDefaultPaymentMethod(methodId);
    if (customerId) await getSavedPaymentMethods(customerId);
  }, [setDefaultPaymentMethod, getSavedPaymentMethods, customerId]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Alerts */}
      {(error || paymentError) && (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{error || paymentError}</Text>
        </View>
      )}
      {successMessage !== '' && (
        <View style={styles.alertSuccess}>
          <Text style={styles.alertSuccessText}>{successMessage}</Text>
        </View>
      )}

      {/* Saved Payment Methods */}
      {savedMethods.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Saved Payment Methods</Text>
          {savedMethods.map((method: SavedPaymentMethodDto) => (
            <Pressable
              key={method.id}
              style={[
                styles.methodCard,
                selectedMethod === method.id && styles.methodCardSelected,
              ]}
              onPress={() => setSelectedMethod(method.id)}
            >
              <View style={styles.methodInfo}>
                <Text style={styles.methodBrand}>{method.brand ?? method.type}</Text>
                {method.last4 && (
                  <Text style={styles.methodLast4}> ending in {method.last4}</Text>
                )}
                {method.isDefault && (
                  <View style={styles.badgePrimary}>
                    <Text style={styles.badgePrimaryText}>Default</Text>
                  </View>
                )}
              </View>
              <View style={styles.methodActions}>
                {!method.isDefault && (
                  <Pressable
                    style={styles.outlineButtonSmall}
                    onPress={() => handleSetDefault(method.id)}
                  >
                    <Text style={styles.outlineButtonSmallText}>Set Default</Text>
                  </Pressable>
                )}
                <Pressable
                  style={styles.dangerButtonSmall}
                  onPress={() => handleDeleteMethod(method.id)}
                >
                  <Text style={styles.dangerButtonSmallText}>Remove</Text>
                </Pressable>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* Payment Form */}
      <View style={styles.formSection}>
        <Text style={styles.sectionTitle}>Make a Payment</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Amount ({config?.defaultCurrency ?? 'USD'})</Text>
          <TextInput
            style={[styles.textInput, loading && styles.textInputDisabled]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            editable={!loading}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={[styles.textInput, loading && styles.textInputDisabled]}
            value={description}
            onChangeText={setDescription}
            placeholder="Payment description"
            editable={!loading}
          />
        </View>

        <Pressable
          style={[styles.primaryButton, (loading || !amount) && styles.buttonDisabled]}
          onPress={handlePay}
          disabled={loading || !amount}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>
              Pay {amount ? `$${parseFloat(amount).toFixed(2)}` : ''}
            </Text>
          )}
        </Pressable>
      </View>
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

  // Payment method cards
  methodCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  methodCardSelected: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  methodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  methodBrand: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  methodLast4: {
    fontSize: 14,
    color: '#666',
  },
  methodActions: {
    flexDirection: 'row',
    gap: 8,
  },

  // Badge
  badgePrimary: {
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgePrimaryText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '600',
  },

  // Form
  formSection: {
    marginBottom: 24,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1a1a',
  },
  textInputDisabled: {
    backgroundColor: '#F3F4F6',
    color: '#9CA3AF',
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
  outlineButtonSmall: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  outlineButtonSmallText: {
    color: '#333',
    fontSize: 13,
    fontWeight: '500',
  },
  dangerButtonSmall: {
    backgroundColor: '#EF4444',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  dangerButtonSmallText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
