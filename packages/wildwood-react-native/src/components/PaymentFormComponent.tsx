import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Linking,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import type { InitiatePaymentResponse } from '@wildwood/core';
import { usePayment } from '../hooks/usePayment';

export interface PaymentFormComponentProps {
  providerId: string;
  appId: string;
  amount: number;
  currency?: string;
  description?: string;
  customerId?: string;
  onPaymentSuccess?: (response: InitiatePaymentResponse) => void;
  onPaymentError?: (error: string) => void;
  style?: ViewStyle;
}

/**
 * Dedicated payment form component - for a specific payment with pre-set amount.
 * Unlike PaymentComponent which includes method management, this is just the form.
 */
export function PaymentFormComponent({
  providerId,
  appId,
  amount,
  currency = 'USD',
  description,
  customerId,
  onPaymentSuccess,
  onPaymentError,
  style,
}: PaymentFormComponentProps) {
  const { initiatePayment, loading } = usePayment();

  const [cardholderName, setCardholderName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setSuccess(false);

    try {
      const result = await initiatePayment({
        providerId,
        appId,
        amount,
        currency,
        description,
        customerId,
        ...(cardholderName || email
          ? {
              metadata: {
                ...(cardholderName ? { cardholderName } : {}),
                ...(email ? { email } : {}),
              },
            }
          : {}),
      });

      if (result.success) {
        if (result.redirectUrl) {
          const url = result.redirectUrl.startsWith('http') ? result.redirectUrl : `https://${result.redirectUrl}`;
          await Linking.openURL(url);
        } else {
          setSuccess(true);
          onPaymentSuccess?.(result);
        }
      } else {
        setError(result.errorMessage ?? 'Payment failed');
        onPaymentError?.(result.errorMessage ?? 'Payment failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Payment failed';
      setError(msg);
      onPaymentError?.(msg);
    }
  }, [
    providerId,
    appId,
    amount,
    currency,
    description,
    customerId,
    cardholderName,
    email,
    initiatePayment,
    onPaymentSuccess,
    onPaymentError,
  ]);

  if (success) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.alertSuccess}>
          <Text style={styles.alertSuccessText}>Payment successful!</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.flex, style]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* Error */}
        {error && (
          <View style={styles.alertError}>
            <Text style={styles.alertErrorText}>{error}</Text>
          </View>
        )}

        {/* Payment Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Payment Summary</Text>
          <View style={styles.amountRow}>
            <Text style={styles.currencyLabel}>{currency}</Text>
            <Text style={styles.amountValue}>${amount.toFixed(2)}</Text>
          </View>
          {description ? <Text style={styles.descriptionText}>{description}</Text> : null}
        </View>

        {/* Form Fields */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Cardholder Name</Text>
          <TextInput
            style={[styles.textInput, loading && styles.textInputDisabled]}
            value={cardholderName}
            onChangeText={setCardholderName}
            placeholder="Name on card"
            autoCapitalize="words"
            editable={!loading}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.textInput, loading && styles.textInputDisabled]}
            value={email}
            onChangeText={setEmail}
            placeholder="Receipt email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />
        </View>

        {/* Submit */}
        <Pressable
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Pay ${amount.toFixed(2)}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  wrapper: {
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

  // Payment summary
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 4,
  },
  currencyLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  amountValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#007AFF',
  },
  descriptionText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },

  // Form
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
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
