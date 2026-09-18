import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, StyleSheet, Linking } from 'react-native';
import type { ViewStyle } from 'react-native';
import type {
  AppPaymentConfigurationDto,
  BillingAddress,
  PaymentCompletionResult,
  PaymentProviderDto,
  SavedPaymentMethodDto,
} from '@wildwood/core';
import { formatMoney } from '@wildwood/core';
import type { PaymentActionAdapter } from '@wildwood/react-shared';
import { usePayment } from '../hooks/usePayment';
import { usePaymentActionHandler } from '../provider/PaymentActionContext';
import {
  createPaymentSession,
  paymentButtonLabel,
  paymentSuccessCopy,
  trialChargeNote,
  trialUnavailableNotice,
  type PaymentSessionState,
} from './paymentSession';

export interface PaymentComponentProps {
  /** Which app's payment configuration to load. Defaults to the provider's app. */
  appId?: string;
  customerId?: string;
  /**
   * A fixed charge. When given the component shows what is being paid for instead of asking for an
   * amount — that is how a plan, a pack or an upgrade is paid. Omit it for the free-form payment
   * screen this component has always been.
   */
  amount?: number;
  currency?: string;
  description?: string;
  /** The pricing model being subscribed to, so the server creates a subscription and not a charge. */
  pricingModelId?: string;
  /** True when the payment starts a recurring subscription rather than buying something once. */
  isSubscription?: boolean;
  /**
   * The subscription starts with this many free-trial days. The button offers the trial instead of a
   * charge, and — when a payment-action handler can confirm a SetupIntent — the card is saved for the
   * charge at trial end rather than charged today.
   */
  trialDays?: number;
  /** The address to bill the card to, for an app whose payment configuration requires one. */
  billingAddress?: BillingAddress;
  /**
   * How a card sheet or 3-D Secure challenge is shown on this device — typically wired over
   * `@stripe/stripe-react-native`; see the README. Overrides `WildwoodProvider`'s handler.
   *
   * Without one (the default) the component never tells the server it can confirm an intent, never
   * asks for a SetupIntent, and sends the customer to the provider's own page when one is offered.
   */
  paymentActionHandler?: PaymentActionAdapter;
  /** Fired exactly once per completed payment, with the payment intent id. */
  onPaymentComplete?: (paymentIntentId: string) => void;
  /** Fired exactly once per completed payment, with the whole result (`transactionId` and all). */
  onPaymentSuccess?: (result: PaymentCompletionResult) => void;
  /**
   * Renders a "Continue" button on the success panel and is called when it is pressed. Without it
   * there is no Continue, because advancing used to re-report the payment and run the host's success
   * handler — a signup, an upgrade — a second time.
   */
  onContinue?: (result: PaymentCompletionResult) => void;
  onPaymentFailure?: (error: string) => void;
  style?: ViewStyle;
}

/** The provider a payment goes to: the app's default, else its flagged default, else the first. */
function selectProvider(config: AppPaymentConfigurationDto | null): PaymentProviderDto | undefined {
  const providers = config?.providers?.filter((p) => p.isEnabled) ?? [];
  if (config?.defaultProviderId) {
    const named = providers.find((p) => p.id === config.defaultProviderId);
    if (named) return named;
  }
  return providers.find((p) => p.isDefault) ?? providers[0];
}

export function PaymentComponent({
  appId,
  customerId,
  amount,
  currency,
  description,
  pricingModelId,
  isSubscription = false,
  trialDays,
  billingAddress,
  paymentActionHandler,
  onPaymentComplete,
  onPaymentSuccess,
  onContinue,
  onPaymentFailure,
  style,
}: PaymentComponentProps) {
  const {
    loading,
    error,
    savedMethods,
    getAppPaymentConfiguration,
    initiatePayment,
    confirmPayment,
    getSavedPaymentMethods,
    deleteSavedPaymentMethod,
    setDefaultPaymentMethod,
  } = usePayment();

  const [config, setConfig] = useState<AppPaymentConfigurationDto | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [descriptionText, setDescriptionText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // A fixed amount is a payment for a known thing; without one this is the free-form screen.
  const fixedAmount = amount !== undefined;
  const effectiveAmount = amount ?? (parseFloat(amountText) || 0);
  const effectiveCurrency = currency ?? config?.defaultCurrency ?? 'USD';
  const effectiveDescription = fixedAmount ? description : descriptionText || description;

  /* The host seam. A prop wins over the one WildwoodProvider supplies, so a screen that names a
     handler gets that one. */
  const handler = usePaymentActionHandler(paymentActionHandler);

  /* Everything the payment decides lives in the session, which has no React in it and is tested on
     its own — this package has no component renderer. The session is built once and reads the
     callbacks, the handler and the hook's methods through refs, so a new inline prop each render
     does not throw away a pending intent. */
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const initiateRef = useRef(initiatePayment);
  initiateRef.current = initiatePayment;
  const confirmRef = useRef(confirmPayment);
  confirmRef.current = confirmPayment;
  const successRef = useRef<(result: PaymentCompletionResult) => void>(() => {});
  const failureRef = useRef<((message: string) => void) | undefined>(onPaymentFailure);
  failureRef.current = onPaymentFailure;

  const session = useMemo(
    () =>
      createPaymentSession({
        initiatePayment: (request) => initiateRef.current(request),
        confirmPayment: (paymentIntentId, providerType) => confirmRef.current(paymentIntentId, providerType),
        getHandler: () => handlerRef.current,
        openUrl: (url) => Linking.openURL(url),
        onSuccess: (result) => successRef.current(result),
        onFailure: (message) => failureRef.current?.(message),
      }),
    [],
  );

  const [sessionState, setSessionState] = useState<PaymentSessionState>(() => session.getState());
  useEffect(() => {
    setSessionState(session.getState());
    return session.subscribe(() => setSessionState(session.getState()));
  }, [session]);

  /* One report per payment, to both callbacks. The free-form screen also empties itself, exactly as
     it did before, so the next payment starts clean. */
  successRef.current = (result: PaymentCompletionResult) => {
    if (!fixedAmount) {
      setAmountText('');
      setDescriptionText('');
    }
    onPaymentComplete?.(result.paymentIntentId ?? '');
    onPaymentSuccess?.(result);
  };

  // A trial refused for one plan says nothing about another: reusing the form re-offers it.
  useEffect(() => {
    session.setPlan({ pricingModelId, trialDays, amount: effectiveAmount });
  }, [session, pricingModelId, trialDays, effectiveAmount]);

  useEffect(() => {
    const load = async () => {
      try {
        const appConfig = await getAppPaymentConfiguration(appId);
        if (appConfig) setConfig(appConfig);
        if (customerId) {
          await getSavedPaymentMethods(customerId);
        }
      } catch (err) {
        console.warn('Failed to load payment configuration:', err);
      }
    };
    load();
  }, [getAppPaymentConfiguration, getSavedPaymentMethods, customerId, appId]);

  const provider = useMemo(() => selectProvider(config), [config]);

  const handlePay = useCallback(async () => {
    setFormError(null);

    if (!fixedAmount && (!amountText || parseFloat(amountText) <= 0)) {
      setFormError('Please enter a valid amount');
      return;
    }

    const providerId = provider?.id ?? config?.defaultProviderId;
    if (!providerId) {
      setFormError('No payment provider configured');
      return;
    }

    await session.pay({
      providerId,
      appId: appId ?? config?.appId ?? '',
      amount: effectiveAmount,
      currency: effectiveCurrency,
      description: effectiveDescription,
      customerId,
      pricingModelId,
      isSubscription,
      trialDays,
      billingAddress,
      publishableKey: provider?.publishableKey,
      providerType: provider?.providerType,
    });
  }, [
    session,
    fixedAmount,
    amountText,
    provider,
    config,
    appId,
    effectiveAmount,
    effectiveCurrency,
    effectiveDescription,
    customerId,
    pricingModelId,
    isSubscription,
    trialDays,
    billingAddress,
  ]);

  const handleDeleteMethod = useCallback(
    async (methodId: string) => {
      try {
        await deleteSavedPaymentMethod(methodId);
        if (selectedMethod === methodId) setSelectedMethod(null);
        if (customerId) await getSavedPaymentMethods(customerId);
      } catch (err) {
        console.warn('Failed to delete payment method:', err);
      }
    },
    [deleteSavedPaymentMethod, selectedMethod, getSavedPaymentMethods, customerId],
  );

  const handleSetDefault = useCallback(
    async (methodId: string) => {
      try {
        await setDefaultPaymentMethod(methodId);
        if (customerId) await getSavedPaymentMethods(customerId);
      } catch (err) {
        console.warn('Failed to set default payment method:', err);
      }
    },
    [setDefaultPaymentMethod, getSavedPaymentMethods, customerId],
  );

  const processing = sessionState.status === 'processing';
  const busy = loading || processing;
  const success = sessionState.result;
  const successCopy = success
    ? paymentSuccessCopy({
        trialEndsAt: sessionState.trialEndsAt,
        confirmed: sessionState.confirmed,
        amount: effectiveAmount,
        currency: effectiveCurrency,
      })
    : null;
  const showTrialNote = (trialDays ?? 0) > 0 && !sessionState.trialUnavailable;
  /* A payment for a known thing is finished once it succeeds — there is nothing left to press, and
     the session refuses a second attempt anyway. The free-form screen keeps its form, because a
     screen whose whole job is taking payments takes more than one (typing clears the last result). */
  const formClosed = fixedAmount && sessionState.status === 'complete';

  return (
    <ScrollView style={[styles.container, style]} contentContainerStyle={styles.contentContainer}>
      {/* Alerts */}
      {(error || formError || sessionState.error) && (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{error || formError || sessionState.error}</Text>
        </View>
      )}
      {sessionState.trialUnavailable && (
        <View style={styles.alertWarning} accessibilityRole="alert">
          <Text style={styles.alertWarningText}>{trialUnavailableNotice(effectiveAmount, effectiveCurrency)}</Text>
        </View>
      )}
      {successCopy && (
        <View style={styles.alertSuccess}>
          <Text style={styles.alertSuccessText}>{successCopy.title}</Text>
          {successCopy.detail ? <Text style={styles.alertSuccessDetail}>{successCopy.detail}</Text> : null}
          {onContinue && success ? (
            <Pressable style={styles.continueButton} onPress={() => onContinue(success)}>
              <Text style={styles.continueButtonText}>Continue</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {/* Saved Payment Methods */}
      {savedMethods.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Saved Payment Methods</Text>
          {savedMethods.map((method: SavedPaymentMethodDto) => (
            <Pressable
              key={method.id}
              style={[styles.methodCard, selectedMethod === method.id && styles.methodCardSelected]}
              onPress={() => setSelectedMethod(method.id)}
            >
              <View style={styles.methodInfo}>
                <Text style={styles.methodBrand}>{method.brand ?? method.type}</Text>
                {method.last4 && <Text style={styles.methodLast4}> ending in {method.last4}</Text>}
                {method.isDefault && (
                  <View style={styles.badgePrimary}>
                    <Text style={styles.badgePrimaryText}>Default</Text>
                  </View>
                )}
              </View>
              <View style={styles.methodActions}>
                {!method.isDefault && (
                  <Pressable style={styles.outlineButtonSmall} onPress={() => handleSetDefault(method.id)}>
                    <Text style={styles.outlineButtonSmallText}>Set Default</Text>
                  </Pressable>
                )}
                <Pressable style={styles.dangerButtonSmall} onPress={() => handleDeleteMethod(method.id)}>
                  <Text style={styles.dangerButtonSmallText}>Remove</Text>
                </Pressable>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* Payment Form */}
      {formClosed ? null : (
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>{fixedAmount ? 'Payment' : 'Make a Payment'}</Text>

          {fixedAmount ? (
            <View style={styles.summary}>
              <Text style={styles.summaryAmount}>{formatMoney(effectiveAmount, effectiveCurrency)}</Text>
              {effectiveDescription ? <Text style={styles.summaryDescription}>{effectiveDescription}</Text> : null}
            </View>
          ) : (
            <>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Amount ({effectiveCurrency})</Text>
                <TextInput
                  style={[styles.textInput, busy && styles.textInputDisabled]}
                  value={amountText}
                  onChangeText={(next) => {
                    // A finished payment is cleared as soon as the next one is being typed, so this
                    // screen can still take more than one.
                    if (sessionState.status === 'complete') session.reset();
                    setAmountText(next);
                  }}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  editable={!busy}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Description (optional)</Text>
                <TextInput
                  style={[styles.textInput, busy && styles.textInputDisabled]}
                  value={descriptionText}
                  onChangeText={setDescriptionText}
                  placeholder="Payment description"
                  editable={!busy}
                />
              </View>
            </>
          )}

          <Pressable
            style={[styles.primaryButton, (busy || (!fixedAmount && !amountText)) && styles.buttonDisabled]}
            onPress={handlePay}
            disabled={busy || (!fixedAmount && !amountText)}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {paymentButtonLabel({
                  amount: effectiveAmount,
                  currency: effectiveCurrency,
                  trialDays,
                  trialUnavailable: sessionState.trialUnavailable,
                })}
              </Text>
            )}
          </Pressable>

          {showTrialNote && <Text style={styles.trialNote}>{trialChargeNote(effectiveAmount, effectiveCurrency)}</Text>}
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
  alertWarning: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  alertWarningText: {
    color: '#92400E',
    fontSize: 14,
  },
  alertSuccess: {
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#22C55E',
    gap: 6,
  },
  alertSuccessText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '600',
  },
  alertSuccessDetail: {
    color: '#166534',
    fontSize: 14,
  },
  continueButton: {
    backgroundColor: '#166534',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  summary: {
    marginBottom: 16,
    gap: 4,
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#007AFF',
  },
  summaryDescription: {
    fontSize: 14,
    color: '#666',
  },
  trialNote: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
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
