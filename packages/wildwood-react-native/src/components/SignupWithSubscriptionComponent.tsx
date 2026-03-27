import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, StyleSheet, Linking } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierModel, AppTierPricingModel } from '@wildwood/core';
import { formatPrice } from '@wildwood/core';
import { PricingDisplayComponent } from './PricingDisplayComponent';
import { useWildwood } from '../hooks/useWildwood';
import { usePayment } from '../hooks/usePayment';

export interface SignupWithSubscriptionComponentProps {
  appId?: string;
  preSelectedTierId?: string;
  registrationToken?: string;
  requireToken?: boolean;
  allowOpenRegistration?: boolean;
  skipTierSelection?: boolean;
  currency?: string;
  onComplete?: () => void;
  onCancel?: () => void;
  style?: ViewStyle;
}

type Step = 'register' | 'select-tier' | 'payment' | 'processing' | 'success';

const STEP_LABELS: Record<Step, string> = {
  register: 'Create Account',
  'select-tier': 'Choose Plan',
  payment: 'Payment',
  processing: 'Processing',
  success: 'Complete',
};

export function SignupWithSubscriptionComponent({
  appId,
  preSelectedTierId,
  registrationToken: initialToken,
  requireToken = false,
  allowOpenRegistration: _allowOpenRegistration = true,
  skipTierSelection = false,
  currency = 'USD',
  onComplete,
  onCancel,
  style,
}: SignupWithSubscriptionComponentProps) {
  const client = useWildwood();
  const { initiatePayment, getAppPaymentConfiguration } = usePayment();
  const resolvedAppId = appId ?? client.config.appId ?? '';
  const [currentStep, setCurrentStep] = useState<Step>('register');

  // Form fields
  const [token, setToken] = useState(initialToken ?? '');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');

  // Tier state
  const [selectedTier, setSelectedTier] = useState<AppTierModel | null>(null);
  const [selectedPricing, setSelectedPricing] = useState<AppTierPricingModel | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState('');
  const [subscriptionFailed, setSubscriptionFailed] = useState(false);
  const processingRef = useRef(false);
  const registeredRef = useRef(false);
  const loggedInRef = useRef(false);

  // Payment state
  const [paymentTransactionId, setPaymentTransactionId] = useState<string | undefined>();
  const [paymentExternalId, setPaymentExternalId] = useState<string | undefined>();
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [payingNow, setPayingNow] = useState(false);

  // Pre-selected tier
  const [preSelectedTier, setPreSelectedTier] = useState<AppTierModel | null>(null);
  const [preSelectedTierPricing, setPreSelectedTierPricing] = useState<AppTierPricingModel | null>(null);
  const [tierLoading, setTierLoading] = useState(!!preSelectedTierId);
  const [showFullTierSelection, setShowFullTierSelection] = useState(false);

  useEffect(() => {
    if (!preSelectedTierId || !resolvedAppId) {
      setTierLoading(false);
      return;
    }
    client.appTier
      .getPublicTiers(resolvedAppId)
      .then((tiers) => {
        const tier = tiers.find((t) => t.id === preSelectedTierId);
        if (tier) {
          setPreSelectedTier(tier);
          const pricing = tier.pricingOptions?.find((p) => p.isDefault) ?? tier.pricingOptions?.[0] ?? null;
          setPreSelectedTierPricing(pricing);
          setSelectedTier(tier);
          setSelectedPricing(pricing);
        }
      })
      .catch((err) => {
        console.warn('Failed to load pre-selected tier details:', err);
      })
      .finally(() => setTierLoading(false));
  }, [preSelectedTierId, resolvedAppId, client.appTier]);

  const hasPreSelectedTier = !!preSelectedTier && !showFullTierSelection;
  const effectiveSkipTierSelection = skipTierSelection || hasPreSelectedTier;

  const requiresPayment =
    selectedTier != null && !selectedTier.isFreeTier && selectedPricing != null && selectedPricing.price > 0;

  const visibleSteps: Step[] = (() => {
    const steps: Step[] = ['register'];
    if (!effectiveSkipTierSelection) steps.push('select-tier');
    if (requiresPayment) steps.push('payment');
    steps.push('success');
    return steps;
  })();

  const getVisibleStepIndex = (step: Step): number => {
    const mapped = step === 'processing' ? 'success' : step;
    return visibleSteps.indexOf(mapped);
  };
  const isStepActive = (step: Step): boolean => getVisibleStepIndex(currentStep) >= getVisibleStepIndex(step);
  const isStepCompleted = (step: Step): boolean => getVisibleStepIndex(currentStep) > getVisibleStepIndex(step);

  const processSignup = useCallback(
    async (tier: AppTierModel | null, pricing: AppTierPricingModel | null, txnId?: string, externalId?: string) => {
      if (processingRef.current) return;
      processingRef.current = true;
      setCurrentStep('processing');
      setProcessingError(null);

      try {
        const appIdForRequest = appId ?? client.config.appId ?? '';

        if (!registeredRef.current) {
          setProcessingStatus('Creating your account...');
          let response;
          if (requireToken && token) {
            response = await client.auth.registerWithToken({
              registrationToken: token,
              firstName,
              lastName,
              username: email,
              email,
              password,
              appId: appIdForRequest,
              platform: 'mobile',
              deviceInfo: 'React Native',
            });
          } else {
            response = await client.auth.register({
              firstName,
              lastName,
              username: email,
              email,
              password,
              appId: appIdForRequest,
              platform: 'mobile',
              deviceInfo: 'React Native',
            });
          }
          registeredRef.current = true;

          if (response.jwtToken) {
            setProcessingStatus('Signing you in...');
            await client.session.login(response);
            loggedInRef.current = true;
          }
        } else if (!loggedInRef.current) {
          setProcessingStatus('Signing you in...');
          const loginResponse = await client.auth.login({
            username: email,
            password,
            appId: appIdForRequest,
            platform: 'mobile',
            deviceInfo: 'React Native',
          });
          if (loginResponse.jwtToken) {
            await client.session.login(loginResponse);
          }
          loggedInRef.current = true;
        }

        // Clear password from memory
        setPassword('');
        setConfirmPassword('');

        // Link payment transaction to newly created user
        const linkId = externalId ?? txnId;
        if (linkId && client.session.userId) {
          try {
            await client.payment.linkTransactionToUser(linkId, client.session.userId);
          } catch (linkErr) {
            // Non-fatal — payment was successful, linking can be retried
            console.warn('Failed to link payment transaction to user:', linkErr);
          }
        }

        if (tier) {
          setProcessingStatus('Activating your plan...');
          const subscribeResult = await client.appTier.selfSubscribe(appIdForRequest, tier.id, pricing?.id, txnId);
          if (!subscribeResult.success) {
            console.warn('Tier subscription failed:', subscribeResult.errorMessage);
            setSubscriptionFailed(true);
          }
        }

        setCurrentStep('success');
      } catch (err) {
        setProcessingError(err instanceof Error ? err.message : 'Signup failed');
      } finally {
        processingRef.current = false;
      }
    },
    [appId, client, firstName, lastName, email, password, token, requireToken],
  );

  const processSignupRef = useRef(processSignup);
  processSignupRef.current = processSignup;

  const validateForm = (): boolean => {
    if (!firstName.trim() || !lastName.trim()) {
      setFormError('First and last name are required');
      return false;
    }
    if (!email.trim()) {
      setFormError('Email is required');
      return false;
    }
    if (!password || password.length < 6) {
      setFormError('Password must be at least 6 characters');
      return false;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      return false;
    }
    if (requireToken && !token.trim()) {
      setFormError('Registration token is required');
      return false;
    }
    setFormError('');
    return true;
  };

  const handleRegisterContinue = useCallback(() => {
    if (!validateForm()) return;
    if (effectiveSkipTierSelection) {
      if (requiresPayment) {
        setCurrentStep('payment');
      } else {
        processSignupRef.current(selectedTier, selectedPricing);
      }
    } else {
      setCurrentStep('select-tier');
    }
  }, [effectiveSkipTierSelection, requiresPayment, selectedTier, selectedPricing]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTierSelected = useCallback((tier: AppTierModel, pricing: AppTierPricingModel | null) => {
    setSelectedTier(tier);
    setSelectedPricing(pricing);

    const isPaid = !tier.isFreeTier && pricing != null && pricing.price > 0;
    if (isPaid) {
      setCurrentStep('payment');
    } else {
      processSignupRef.current(tier, pricing);
    }
  }, []);

  // Payment handler — uses the payment service to initiate payment
  const handlePayment = useCallback(async () => {
    if (!selectedTier || !selectedPricing) return;
    setPaymentError(null);
    setPayingNow(true);

    try {
      const payConfig = await getAppPaymentConfiguration();
      if (!payConfig?.defaultProviderId) {
        setPaymentError('No payment provider configured');
        setPayingNow(false);
        return;
      }

      const result = await initiatePayment({
        providerId: payConfig.defaultProviderId,
        appId: payConfig.appId,
        amount: selectedPricing.price,
        currency: currency,
        description: `${selectedTier.name} Subscription`,
        pricingModelId: selectedPricing.pricingModelId,
      });

      if (result.success) {
        if (result.redirectUrl) {
          // Mobile payment flow — open in browser
          const url = result.redirectUrl.startsWith('http') ? result.redirectUrl : `https://${result.redirectUrl}`;
          await Linking.openURL(url);
        }

        const txnId = result.paymentIntentId ?? result.orderId;
        const extId = result.paymentIntentId;
        setPaymentTransactionId(txnId);
        setPaymentExternalId(extId);
        processSignupRef.current(selectedTier, selectedPricing, txnId, extId);
      } else {
        setPaymentError(result.errorMessage ?? 'Payment failed');
      }
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setPayingNow(false);
    }
  }, [selectedTier, selectedPricing, currency, getAppPaymentConfiguration, initiatePayment]);

  const handleRetry = useCallback(() => {
    processSignup(selectedTier, selectedPricing, paymentTransactionId, paymentExternalId);
  }, [selectedTier, selectedPricing, processSignup, paymentTransactionId, paymentExternalId]);

  const handleBack = useCallback(() => {
    if (currentStep === 'select-tier') {
      setCurrentStep('register');
      if (preSelectedTier) setShowFullTierSelection(false);
    } else if (currentStep === 'payment') {
      if (effectiveSkipTierSelection) {
        setCurrentStep('register');
      } else {
        setCurrentStep('select-tier');
      }
    }
  }, [currentStep, preSelectedTier, effectiveSkipTierSelection]);

  const handleChangePlan = useCallback(() => {
    setShowFullTierSelection(true);
    setCurrentStep('select-tier');
  }, []);

  if (tierLoading) {
    return (
      <View style={[styles.centered, style]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.mutedText}>Loading plan details...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, style]} contentContainerStyle={styles.content}>
      {/* Step indicator */}
      {currentStep !== 'success' && currentStep !== 'processing' ? (
        <View style={styles.stepIndicator}>
          {visibleSteps.map((stepKey, index) => (
            <View key={stepKey} style={styles.stepGroup}>
              {index > 0 ? (
                <View
                  style={[
                    styles.stepConnector,
                    isStepCompleted(visibleSteps[index - 1]) && styles.stepConnectorCompleted,
                  ]}
                />
              ) : null}
              <View
                style={[
                  styles.stepCircle,
                  isStepActive(stepKey) && styles.stepCircleActive,
                  isStepCompleted(stepKey) && styles.stepCircleCompleted,
                ]}
              >
                <Text
                  style={[
                    styles.stepNumber,
                    (isStepActive(stepKey) || isStepCompleted(stepKey)) && styles.stepNumberActive,
                  ]}
                >
                  {isStepCompleted(stepKey) ? '\u2713' : index + 1}
                </Text>
              </View>
              <Text style={[styles.stepLabel, isStepActive(stepKey) && styles.stepLabelActive]}>
                {STEP_LABELS[stepKey]}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Plan summary card */}
      {hasPreSelectedTier && currentStep === 'register' && preSelectedTier ? (
        <View style={styles.planSummary}>
          <View style={styles.planSummaryContent}>
            <View style={styles.planInfo}>
              <Text style={styles.planName}>{preSelectedTier.name}</Text>
              {preSelectedTier.description ? <Text style={styles.planDesc}>{preSelectedTier.description}</Text> : null}
            </View>
            <View style={styles.planPrice}>
              {preSelectedTier.isFreeTier && !preSelectedTierPricing ? (
                <Text style={styles.priceAmount}>Free</Text>
              ) : preSelectedTierPricing ? (
                <>
                  <Text style={styles.priceAmount}>{formatPrice(preSelectedTierPricing.price, currency)}</Text>
                  <Text style={styles.pricePeriod}>
                    /{preSelectedTierPricing.billingFrequency?.toLowerCase() ?? 'month'}
                  </Text>
                </>
              ) : null}
            </View>
          </View>
          <Pressable onPress={handleChangePlan}>
            <Text style={styles.changePlanLink}>Change plan</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Step 1: Registration form */}
      {currentStep === 'register' ? (
        <View style={styles.formContainer}>
          {formError ? (
            <View style={styles.alertDanger}>
              <Text style={styles.alertDangerText}>{formError}</Text>
            </View>
          ) : null}

          {requireToken ? (
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Registration Token *</Text>
              <TextInput
                style={styles.textInput}
                value={token}
                onChangeText={setToken}
                placeholder="Enter your registration token"
                autoCapitalize="none"
              />
            </View>
          ) : null}

          <View style={styles.nameRow}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>First Name *</Text>
              <TextInput
                style={styles.textInput}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
                autoCapitalize="words"
              />
            </View>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Last Name *</Text>
              <TextInput
                style={styles.textInput}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last name"
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Email *</Text>
            <TextInput
              style={styles.textInput}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Password *</Text>
            <TextInput
              style={styles.textInput}
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Confirm Password *</Text>
            <TextInput
              style={styles.textInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm your password"
              secureTextEntry
            />
          </View>

          <Pressable style={styles.primaryButton} onPress={handleRegisterContinue}>
            <Text style={styles.primaryButtonText}>{effectiveSkipTierSelection ? 'Create Account' : 'Continue'}</Text>
          </Pressable>

          {onCancel ? (
            <Pressable style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.linkText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Step 2: Tier selection */}
      {currentStep === 'select-tier' ? (
        <View>
          <PricingDisplayComponent
            appId={appId}
            preSelectedTierId={preSelectedTierId}
            title="Choose Your Plan"
            subtitle={
              preSelectedTierId
                ? 'Confirm your selected plan or choose a different one.'
                : 'Select a plan that fits your needs.'
            }
            showBillingToggle={true}
            showFeatureComparison={true}
            showLimits={true}
            currency={currency}
            onSelectTier={handleTierSelected}
          />
          <View style={styles.navRow}>
            <Pressable onPress={handleBack}>
              <Text style={styles.linkText}>{'\u2039'} Back</Text>
            </Pressable>
            {onCancel ? (
              <Pressable onPress={onCancel}>
                <Text style={styles.linkText}>Cancel</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Step 3: Payment */}
      {currentStep === 'payment' && selectedTier && selectedPricing ? (
        <View>
          {/* Order summary */}
          <View style={styles.orderSummary}>
            <Text style={styles.orderSummaryTitle}>Order Summary</Text>
            <View style={styles.orderSummaryRow}>
              <Text style={styles.orderSummaryName}>{selectedTier.name}</Text>
              <Text style={styles.orderSummaryPrice}>
                {formatPrice(selectedPricing.price, currency)}
                <Text style={styles.pricePeriod}>/{selectedPricing.billingFrequency?.toLowerCase() ?? 'month'}</Text>
              </Text>
            </View>
          </View>

          {paymentError ? (
            <View style={styles.alertDanger}>
              <Text style={styles.alertDangerText}>{paymentError}</Text>
            </View>
          ) : null}

          <Pressable
            style={[styles.primaryButton, payingNow && styles.buttonDisabled]}
            onPress={handlePayment}
            disabled={payingNow}
          >
            {payingNow ? (
              <View style={styles.buttonRow}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.primaryButtonText}> Processing...</Text>
              </View>
            ) : (
              <Text style={styles.primaryButtonText}>Pay {formatPrice(selectedPricing.price, currency)}</Text>
            )}
          </Pressable>

          <View style={styles.navRow}>
            <Pressable onPress={handleBack}>
              <Text style={styles.linkText}>{'\u2039'} Back</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Processing */}
      {currentStep === 'processing' ? (
        <View style={styles.centered}>
          {processingError ? (
            <>
              <Text style={styles.errorIcon}>{'\u2717'}</Text>
              <Text style={styles.processingTitle}>Something Went Wrong</Text>
              <Text style={styles.mutedText}>{processingError}</Text>
              <View style={styles.processingActions}>
                <Pressable style={styles.primaryButton} onPress={handleRetry}>
                  <Text style={styles.primaryButtonText}>Try Again</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    registeredRef.current = false;
                    loggedInRef.current = false;
                    setCurrentStep('register');
                  }}
                >
                  <Text style={styles.linkText}>Start Over</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.processingTitle}>{processingStatus}</Text>
              <Text style={styles.mutedText}>Please wait while we set up your account.</Text>
            </>
          )}
        </View>
      ) : null}

      {/* Success */}
      {currentStep === 'success' ? (
        <View style={styles.centered}>
          <Text style={styles.successIcon}>{'\u2713'}</Text>
          <Text style={styles.processingTitle}>You're All Set!</Text>
          <Text style={styles.mutedText}>
            {skipTierSelection && !hasPreSelectedTier
              ? 'Your account has been created successfully.'
              : subscriptionFailed
                ? 'Your account is ready! Plan activation is pending.'
                : 'Your account has been created and your plan is active.'}
          </Text>
          <Pressable style={styles.primaryButtonLg} onPress={onComplete}>
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  centered: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  mutedText: { fontSize: 14, color: '#999', textAlign: 'center' },

  // Step indicator
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  stepGroup: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  stepConnector: { width: 30, height: 2, backgroundColor: '#ddd', marginHorizontal: 4 },
  stepConnectorCompleted: { backgroundColor: '#007AFF' },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: { backgroundColor: '#007AFF' },
  stepCircleCompleted: { backgroundColor: '#22C55E' },
  stepNumber: { fontSize: 13, fontWeight: '600', color: '#999' },
  stepNumberActive: { color: '#fff' },
  stepLabel: { fontSize: 11, color: '#999', marginLeft: 4 },
  stepLabelActive: { color: '#007AFF', fontWeight: '600' },

  // Plan summary
  planSummary: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  planSummaryContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planInfo: { flex: 1 },
  planName: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  planDesc: { fontSize: 13, color: '#666', marginTop: 2 },
  planPrice: { flexDirection: 'row', alignItems: 'baseline' },
  priceAmount: { fontSize: 20, fontWeight: '700', color: '#007AFF' },
  pricePeriod: { fontSize: 13, color: '#666' },
  changePlanLink: { color: '#007AFF', fontSize: 14, fontWeight: '600' },

  // Form
  formContainer: { gap: 14 },
  formGroup: { gap: 4 },
  nameRow: { flexDirection: 'row', gap: 10 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
    backgroundColor: '#fff',
  },
  alertDanger: { backgroundColor: '#FEE2E2', borderRadius: 8, padding: 12, marginBottom: 8 },
  alertDangerText: { color: '#991B1B', fontSize: 14 },

  // Order summary
  orderSummary: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  orderSummaryTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  orderSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderSummaryName: { fontSize: 14, color: '#333' },
  orderSummaryPrice: { fontSize: 16, fontWeight: '700', color: '#007AFF' },

  // Navigation
  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  linkText: { color: '#007AFF', fontSize: 14, fontWeight: '600' },
  cancelButton: { alignItems: 'center', marginTop: 8 },

  // Processing/Success
  errorIcon: { fontSize: 48, color: '#EF4444', fontWeight: '700' },
  successIcon: { fontSize: 48, color: '#22C55E', fontWeight: '700' },
  processingTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  processingActions: { gap: 12, alignItems: 'center', marginTop: 8 },

  // Buttons
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  primaryButtonLg: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
