import { useState, useCallback, useRef } from 'react';
import type { RegistrationFormData, AppTierModel, AppTierPricingModel } from '@wildwood/core';
import { TokenRegistrationComponent } from './TokenRegistrationComponent.js';
import { PricingDisplayComponent } from '../pricing/PricingDisplayComponent.js';
import { useWildwood } from '../../hooks/useWildwood.js';

export interface SignupWithSubscriptionComponentProps {
  appId?: string;
  preSelectedTierId?: string;
  registrationToken?: string;
  requireToken?: boolean;
  allowOpenRegistration?: boolean;
  skipTierSelection?: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
  className?: string;
}

type Step = 'register' | 'select-tier' | 'processing' | 'success';

// Steps shown in the visual step indicator
const VISIBLE_STEPS: Step[] = ['register', 'select-tier', 'success'];

export function SignupWithSubscriptionComponent({
  appId,
  preSelectedTierId,
  registrationToken,
  requireToken = false,
  allowOpenRegistration = true,
  skipTierSelection = false,
  onComplete,
  onCancel,
  className,
}: SignupWithSubscriptionComponentProps) {
  const client = useWildwood();
  const [currentStep, setCurrentStep] = useState<Step>('register');
  const [formData, setFormData] = useState<RegistrationFormData | null>(null);
  const [selectedTier, setSelectedTier] = useState<AppTierModel | null>(null);
  const [selectedPricing, setSelectedPricing] = useState<AppTierPricingModel | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState('');
  const [subscriptionFailed, setSubscriptionFailed] = useState(false);
  const processingRef = useRef(false);
  // Track completed sub-steps so retry doesn't re-register an already-created user
  const registeredRef = useRef(false);
  const loggedInRef = useRef(false);

  const getVisibleStepIndex = (step: Step): number => {
    // Map processing to the same index as success (step 3)
    const mapped = step === 'processing' ? 'success' : step;
    return VISIBLE_STEPS.indexOf(mapped);
  };
  const isStepActive = (step: Step): boolean => getVisibleStepIndex(currentStep) >= getVisibleStepIndex(step);
  const isStepCompleted = (step: Step): boolean => getVisibleStepIndex(currentStep) > getVisibleStepIndex(step);

  // Step 3: Register user → login → subscribe (defined first, stored in ref for stable access)
  const processSignup = useCallback(
    async (data: RegistrationFormData, tier: AppTierModel | null, pricing: AppTierPricingModel | null) => {
      if (processingRef.current) return;
      processingRef.current = true;
      setCurrentStep('processing');
      setProcessingError(null);

      try {
        const resolvedAppId = appId ?? client.config.appId ?? '';

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
              appId: resolvedAppId,
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
              appId: resolvedAppId,
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
            appId: resolvedAppId,
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
          const subscribeResult = await client.appTier.selfSubscribe(resolvedAppId, tier.id, pricing?.id);
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

  // Step 1: Form data collected (not submitted to API)
  const handleFormDataCollected = useCallback(
    (data: RegistrationFormData) => {
      setFormData(data);
      if (skipTierSelection) {
        processSignupRef.current(data, null, null);
      } else {
        setCurrentStep('select-tier');
      }
    },
    [skipTierSelection],
  );

  // Step 2: Tier selected
  const handleTierSelected = useCallback(
    (tier: AppTierModel, pricing: AppTierPricingModel | null) => {
      setSelectedTier(tier);
      setSelectedPricing(pricing);

      if (!formData) return;

      // TODO: For paid tiers, insert payment step here before processSignup.
      processSignupRef.current(formData, tier, pricing);
    },
    [formData],
  );

  const handleRetry = useCallback(() => {
    if (formData && (selectedTier || skipTierSelection)) {
      processSignup(formData, selectedTier, selectedPricing);
    }
  }, [formData, selectedTier, selectedPricing, skipTierSelection, processSignup]);

  const handleBack = useCallback(() => {
    if (currentStep === 'select-tier') {
      setCurrentStep('register');
    }
  }, [currentStep]);

  return (
    <div className={`ww-signup-subscription ${className ?? ''}`}>
      {/* Step Indicator */}
      {currentStep !== 'success' && currentStep !== 'processing' && (
        <div className="ww-step-indicator">
          <div className="ww-steps">
            {VISIBLE_STEPS.map((stepKey, index) => (
              <div key={stepKey} className="ww-step-group">
                {index > 0 && (
                  <div
                    className={`ww-step-connector ${isStepCompleted(VISIBLE_STEPS[index - 1]) ? 'ww-step-connector-completed' : ''}`}
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
                  <span className="ww-step-label">
                    {stepKey === 'register' ? 'Create Account' : stepKey === 'select-tier' ? 'Choose Plan' : 'Complete'}
                  </span>
                </div>
              </div>
            ))}
          </div>
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
            submitButtonText={skipTierSelection ? 'Create Account' : 'Continue'}
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

      {/* Step 3: Success */}
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
            {skipTierSelection
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
