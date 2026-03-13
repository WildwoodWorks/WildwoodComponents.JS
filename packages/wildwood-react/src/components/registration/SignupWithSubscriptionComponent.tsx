import { useState, useEffect, useCallback, useRef } from 'react';
import type { RegistrationFormData, AppTierModel, AppTierPricingModel, PaymentCompletionResult } from '@wildwood/core';
import { TokenRegistrationComponent } from './TokenRegistrationComponent.js';
import { PricingDisplayComponent } from '../pricing/PricingDisplayComponent.js';
import { PaymentComponent } from '../payment/PaymentComponent.js';
import { useWildwood } from '../../hooks/useWildwood.js';

export interface SignupWithSubscriptionComponentProps {
  appId?: string;
  preSelectedTierId?: string;
  registrationToken?: string;
  requireToken?: boolean;
  allowOpenRegistration?: boolean;
  skipTierSelection?: boolean;
  requireBillingAddress?: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
  className?: string;
}

type Step = 'register' | 'select-tier' | 'payment' | 'processing' | 'success';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '\u20AC',
  GBP: '\u00A3',
  JPY: '\u00A5',
};

function formatPrice(amount: number, currency = 'USD'): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '$';
  return currency === 'JPY' ? `${symbol}${Math.round(amount)}` : `${symbol}${amount.toFixed(0)}`;
}

export function SignupWithSubscriptionComponent({
  appId,
  preSelectedTierId,
  registrationToken,
  requireToken = false,
  allowOpenRegistration = true,
  skipTierSelection = false,
  requireBillingAddress = false,
  onComplete,
  onCancel,
  className,
}: SignupWithSubscriptionComponentProps) {
  const client = useWildwood();
  const resolvedAppId = appId ?? client.config.appId ?? '';
  const [currentStep, setCurrentStep] = useState<Step>('register');
  const [formData, setFormData] = useState<RegistrationFormData | null>(null);
  const [selectedTier, setSelectedTier] = useState<AppTierModel | null>(null);
  const [selectedPricing, setSelectedPricing] = useState<AppTierPricingModel | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState('');
  const [subscriptionFailed, setSubscriptionFailed] = useState(false);
  const [paymentTransactionId, setPaymentTransactionId] = useState<string | undefined>();
  const processingRef = useRef(false);
  // Track completed sub-steps so retry doesn't re-register an already-created user
  const registeredRef = useRef(false);
  const loggedInRef = useRef(false);

  // Pre-selected tier: fetch tier details and show summary card instead of tier selection step
  const [preSelectedTier, setPreSelectedTier] = useState<AppTierModel | null>(null);
  const [preSelectedTierPricing, setPreSelectedTierPricing] = useState<AppTierPricingModel | null>(null);
  const [tierLoading, setTierLoading] = useState(!!preSelectedTierId);
  // When true, user clicked "Change plan" — show full tier grid even though we had a preSelectedTierId
  const [showFullTierSelection, setShowFullTierSelection] = useState(false);

  // Fetch tier details when preSelectedTierId is provided
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
      .catch(() => {
        // If fetch fails, fall back to showing the full tier selection
      })
      .finally(() => {
        setTierLoading(false);
      });
  }, [preSelectedTierId, resolvedAppId, client.appTier]);

  // Determine the effective flow
  const hasPreSelectedTier = !!preSelectedTier && !showFullTierSelection;
  const effectiveSkipTierSelection = skipTierSelection || hasPreSelectedTier;

  // Is the selected tier a paid tier that requires payment?
  const requiresPayment =
    selectedTier != null && !selectedTier.isFreeTier && selectedPricing != null && selectedPricing.price > 0;

  // Build visible steps dynamically based on flow
  const visibleSteps: Step[] = (() => {
    const steps: Step[] = ['register'];
    if (!effectiveSkipTierSelection) steps.push('select-tier');
    if (requiresPayment) steps.push('payment');
    steps.push('success');
    return steps;
  })();

  const getVisibleStepIndex = (step: Step): number => {
    // Map processing to same position as success in the indicator
    const mapped = step === 'processing' ? 'success' : step;
    return visibleSteps.indexOf(mapped);
  };
  const isStepActive = (step: Step): boolean => getVisibleStepIndex(currentStep) >= getVisibleStepIndex(step);
  const isStepCompleted = (step: Step): boolean => getVisibleStepIndex(currentStep) > getVisibleStepIndex(step);

  const stepLabels: Record<Step, string> = {
    register: 'Create Account',
    'select-tier': 'Choose Plan',
    payment: 'Payment',
    processing: 'Processing',
    success: 'Complete',
  };

  // Processing: Register user → login → subscribe
  const processSignup = useCallback(
    async (
      data: RegistrationFormData,
      tier: AppTierModel | null,
      pricing: AppTierPricingModel | null,
      txnId?: string,
    ) => {
      if (processingRef.current) return;
      processingRef.current = true;
      setCurrentStep('processing');
      setProcessingError(null);

      try {
        const appIdForRequest = appId ?? client.config.appId ?? '';

        // 1. Register the user (skip if already completed on a previous attempt)
        if (!registeredRef.current) {
          setProcessingStatus('Creating your account...');

          let response;
          if (data.useToken && data.registrationToken) {
            response = await client.auth.registerWithToken({
              registrationToken: data.registrationToken,
              firstName: data.firstName,
              lastName: data.lastName,
              username: data.username,
              email: data.email,
              password: data.password,
              appId: appIdForRequest,
              platform: 'web',
              deviceInfo: navigator.userAgent,
            });
          } else {
            response = await client.auth.register({
              firstName: data.firstName,
              lastName: data.lastName,
              username: data.username,
              email: data.email,
              password: data.password,
              appId: appIdForRequest,
              platform: 'web',
              deviceInfo: navigator.userAgent,
            });
          }
          registeredRef.current = true;

          // 2. Auto-login
          if (response.jwtToken) {
            setProcessingStatus('Signing you in...');
            await client.session.login(response);
            loggedInRef.current = true;
          }
        } else if (!loggedInRef.current) {
          // Registered but login failed last time — login with credentials
          setProcessingStatus('Signing you in...');
          const loginResponse = await client.auth.login({
            username: data.email,
            password: data.password ?? '',
            appId: appIdForRequest,
            platform: 'web',
            deviceInfo: navigator.userAgent,
          });
          if (loginResponse.jwtToken) {
            await client.session.login(loginResponse);
          }
          loggedInRef.current = true;
        }

        // Clear password from memory now that login is complete
        if (data.password) {
          data.password = '';
        }

        // 3. Subscribe to tier (if one was selected)
        if (tier) {
          setProcessingStatus('Activating your plan...');
          const subscribeResult = await client.appTier.selfSubscribe(appIdForRequest, tier.id, pricing?.id, txnId);
          if (!subscribeResult.success) {
            // Non-fatal — account was created, subscription can be done later
            console.warn('Tier subscription failed:', subscribeResult.errorMessage);
            setSubscriptionFailed(true);
          }
        }

        setCurrentStep('success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Signup failed';
        setProcessingError(msg);
      } finally {
        processingRef.current = false;
      }
    },
    [appId, client],
  );

  // Stable ref so handlers always call the latest processSignup
  const processSignupRef = useRef(processSignup);
  processSignupRef.current = processSignup;

  // After registration form: decide next step
  const handleFormDataCollected = useCallback(
    (data: RegistrationFormData) => {
      setFormData(data);
      if (effectiveSkipTierSelection) {
        // Tier already selected (pre-selected) or skipped
        if (requiresPayment) {
          setCurrentStep('payment');
        } else {
          processSignupRef.current(data, selectedTier, selectedPricing);
        }
      } else {
        setCurrentStep('select-tier');
      }
    },
    [effectiveSkipTierSelection, requiresPayment, selectedTier, selectedPricing],
  );

  // Tier selected from full grid
  const handleTierSelected = useCallback(
    (tier: AppTierModel, pricing: AppTierPricingModel | null) => {
      setSelectedTier(tier);
      setSelectedPricing(pricing);

      if (!formData) return;

      // Check if this tier requires payment
      const isPaid = !tier.isFreeTier && pricing != null && pricing.price > 0;
      if (isPaid) {
        setCurrentStep('payment');
      } else {
        processSignupRef.current(formData, tier, pricing);
      }
    },
    [formData],
  );

  // Payment completed successfully
  const handlePaymentSuccess = useCallback(
    (result: PaymentCompletionResult) => {
      const txnId = result.transactionId ?? result.paymentIntentId;
      setPaymentTransactionId(txnId);

      if (!formData) return;
      processSignupRef.current(formData, selectedTier, selectedPricing, txnId);
    },
    [formData, selectedTier, selectedPricing],
  );

  // Payment failed
  const handlePaymentFailure = useCallback((errorMsg: string) => {
    // Stay on payment step, PaymentComponent shows its own error
    console.warn('Payment failed:', errorMsg);
  }, []);

  const handleRetry = useCallback(() => {
    if (formData && (selectedTier || skipTierSelection)) {
      processSignup(formData, selectedTier, selectedPricing, paymentTransactionId);
    }
  }, [formData, selectedTier, selectedPricing, skipTierSelection, processSignup, paymentTransactionId]);

  const handleBack = useCallback(() => {
    if (currentStep === 'select-tier') {
      setCurrentStep('register');
      if (preSelectedTier) {
        setShowFullTierSelection(false);
      }
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
      <div className={`ww-signup-subscription ${className ?? ''}`}>
        <div className="ww-signup-step ww-signup-processing">
          <div className="ww-reg-success-icon">
            <span className="ww-spinner ww-spinner-lg" />
          </div>
          <p className="ww-text-muted">Loading plan details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`ww-signup-subscription ${className ?? ''}`}>
      {/* Step Indicator */}
      {currentStep !== 'success' && currentStep !== 'processing' && (
        <div className="ww-step-indicator">
          <div className="ww-steps">
            {visibleSteps.map((stepKey, index) => (
              <div key={stepKey} className="ww-step-group">
                {index > 0 && (
                  <div
                    className={`ww-step-connector ${isStepCompleted(visibleSteps[index - 1]) ? 'ww-step-connector-completed' : ''}`}
                  />
                )}
                <div
                  className={`ww-step ${isStepActive(stepKey) ? 'ww-step-active' : ''} ${isStepCompleted(stepKey) ? 'ww-step-completed' : ''}`}
                >
                  <span className="ww-step-number">
                    {isStepCompleted(stepKey) ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="ww-step-label">{stepLabels[stepKey]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan Summary Card — shown above registration when a tier is pre-selected */}
      {hasPreSelectedTier && currentStep === 'register' && preSelectedTier && (
        <div className="ww-plan-summary-card">
          <div className="ww-plan-summary-content">
            <div className="ww-plan-info">
              <h5 className="ww-plan-name">{preSelectedTier.name}</h5>
              {preSelectedTier.description && <p className="ww-plan-desc">{preSelectedTier.description}</p>}
            </div>
            <div className="ww-plan-price">
              {preSelectedTier.isFreeTier && !preSelectedTierPricing ? (
                <span className="ww-price-amount">Free</span>
              ) : preSelectedTierPricing ? (
                <>
                  <span className="ww-price-amount">{formatPrice(preSelectedTierPricing.price)}</span>
                  <span className="ww-price-period">
                    /{preSelectedTierPricing.billingFrequency?.toLowerCase() ?? 'month'}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <button type="button" className="ww-plan-change-link" onClick={handleChangePlan}>
            Change plan
          </button>
        </div>
      )}

      {/* Step 1: Collect Registration Data (no API call) */}
      {currentStep === 'register' && (
        <div className="ww-signup-step">
          <TokenRegistrationComponent
            appId={appId}
            registrationToken={registrationToken}
            requireToken={requireToken}
            allowOpenRegistration={allowOpenRegistration}
            deferSubmission={true}
            onFormDataCollected={handleFormDataCollected}
            initialFormData={formData ?? undefined}
            hideStepIndicator={true}
            submitButtonText={effectiveSkipTierSelection ? 'Create Account' : 'Continue'}
            onCancel={onCancel}
          />
        </div>
      )}

      {/* Step 2: Tier Selection (uses public endpoint, no auth needed) */}
      {currentStep === 'select-tier' && (
        <div className="ww-signup-step">
          <PricingDisplayComponent
            appId={appId}
            preSelectedTierId={preSelectedTierId}
            title="Choose Your Plan"
            subtitle={
              preSelectedTierId
                ? 'Confirm your selected plan or choose a different one.'
                : 'Select a plan that fits your needs. You can always change later.'
            }
            showBillingToggle={true}
            showFeatureComparison={true}
            showLimits={true}
            onSelectTier={handleTierSelected}
          />
          <div className="ww-signup-step-nav">
            <button type="button" className="ww-btn ww-btn-link" onClick={handleBack}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </button>
            {onCancel && (
              <button type="button" className="ww-btn ww-btn-link" onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Payment Step — shown for paid tiers before account creation */}
      {currentStep === 'payment' && selectedTier && selectedPricing && (
        <div className="ww-signup-step">
          {/* Order summary above payment */}
          <div className="ww-payment-summary">
            <div className="ww-payment-summary-header">
              <h4>Order Summary</h4>
            </div>
            <div className="ww-payment-summary-row">
              <span>{selectedTier.name}</span>
              <span className="ww-payment-summary-price">
                {formatPrice(selectedPricing.price)}
                <span className="ww-payment-summary-period">
                  /{selectedPricing.billingFrequency?.toLowerCase() ?? 'month'}
                </span>
              </span>
            </div>
          </div>

          <PaymentComponent
            appId={appId}
            amount={selectedPricing.price}
            currency="USD"
            description={`${selectedTier.name} Subscription`}
            pricingModelId={selectedPricing.pricingModelId}
            isSubscription={true}
            showAmount={false}
            requireBillingAddress={requireBillingAddress}
            onPaymentSuccess={handlePaymentSuccess}
            onPaymentFailure={handlePaymentFailure}
            onCancel={handleBack}
          />

          <div className="ww-signup-step-nav">
            <button type="button" className="ww-btn ww-btn-link" onClick={handleBack}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </button>
          </div>
        </div>
      )}

      {/* Processing Step: Register → Login → Subscribe */}
      {currentStep === 'processing' && (
        <div className="ww-signup-step ww-signup-processing">
          {processingError ? (
            <>
              <div className="ww-reg-success-icon">
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--ww-danger, #dc3545)"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <h3>Something Went Wrong</h3>
              <p className="ww-text-muted">{processingError}</p>
              <div className="ww-signup-processing-actions">
                <button type="button" className="ww-btn ww-btn-primary" onClick={handleRetry}>
                  Try Again
                </button>
                <button
                  type="button"
                  className="ww-btn ww-btn-link"
                  onClick={() => {
                    registeredRef.current = false;
                    loggedInRef.current = false;
                    setCurrentStep('register');
                  }}
                >
                  Start Over
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="ww-reg-success-icon">
                <span className="ww-spinner ww-spinner-lg" />
              </div>
              <h3>{processingStatus}</h3>
              <p className="ww-text-muted">Please wait while we set up your account.</p>
            </>
          )}
        </div>
      )}

      {/* Success */}
      {currentStep === 'success' && (
        <div className="ww-signup-step ww-signup-success">
          <div className="ww-reg-success-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h3>You&apos;re All Set!</h3>
          <p className="ww-text-muted">
            {skipTierSelection && !hasPreSelectedTier
              ? 'Your account has been created successfully.'
              : subscriptionFailed
                ? 'Your account is ready! Plan activation is pending — you can select a plan from your dashboard.'
                : 'Your account has been created and your plan is active.'}
          </p>
          <button type="button" className="ww-btn ww-btn-primary ww-btn-lg" onClick={onComplete}>
            Get Started
          </button>
        </div>
      )}
    </div>
  );
}
