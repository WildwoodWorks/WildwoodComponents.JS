import { useState, useCallback } from 'react';
import type { AuthenticationResponse } from '@wildwood/core';
import { TokenRegistrationComponent } from './TokenRegistrationComponent.js';
import { AppTierComponent } from '../apptier/AppTierComponent.js';

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

type Step = 'register' | 'select-tier' | 'success';

const STEP_CONFIG: { key: Step; label: string; number: number }[] = [
  { key: 'register', label: 'Create Account', number: 1 },
  { key: 'select-tier', label: 'Choose Plan', number: 2 },
  { key: 'success', label: 'Complete', number: 3 },
];

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
  const [currentStep, setCurrentStep] = useState<Step>('register');
  const [selectedTierId, setSelectedTierId] = useState<string | undefined>(preSelectedTierId);

  const getStepIndex = (step: Step): number => STEP_CONFIG.findIndex((s) => s.key === step);
  const isStepActive = (step: Step): boolean => getStepIndex(currentStep) >= getStepIndex(step);
  const isStepCompleted = (step: Step): boolean => getStepIndex(currentStep) > getStepIndex(step);

  const handleAutoLoginSuccess = useCallback(
    (_response: AuthenticationResponse) => {
      if (skipTierSelection) {
        setCurrentStep('success');
      } else {
        setCurrentStep('select-tier');
      }
    },
    [skipTierSelection],
  );

  const handleTierChanged = useCallback((tierId: string) => {
    setSelectedTierId(tierId);
    setCurrentStep('success');
  }, []);

  const handleBack = useCallback(() => {
    if (currentStep === 'select-tier') {
      setCurrentStep('register');
    }
  }, [currentStep]);

  return (
    <div className={`ww-signup-subscription ${className ?? ''}`}>
      {/* Step Indicator */}
      {currentStep !== 'success' && (
        <div className="ww-step-indicator">
          <div className="ww-steps">
            {STEP_CONFIG.map((stepDef, index) => (
              <div key={stepDef.key} className="ww-step-group">
                {index > 0 && (
                  <div
                    className={`ww-step-connector ${isStepCompleted(STEP_CONFIG[index - 1].key) ? 'ww-step-connector-completed' : ''}`}
                  />
                )}
                <div
                  className={`ww-step ${isStepActive(stepDef.key) ? 'ww-step-active' : ''} ${isStepCompleted(stepDef.key) ? 'ww-step-completed' : ''}`}
                >
                  <span className="ww-step-number">
                    {isStepCompleted(stepDef.key) ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      stepDef.number
                    )}
                  </span>
                  <span className="ww-step-label">{stepDef.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Registration */}
      {currentStep === 'register' && (
        <div className="ww-signup-step">
          <TokenRegistrationComponent
            appId={appId}
            registrationToken={registrationToken}
            requireToken={requireToken}
            allowOpenRegistration={allowOpenRegistration}
            autoLogin={true}
            onAutoLoginSuccess={handleAutoLoginSuccess}
            onCancel={onCancel}
          />
        </div>
      )}

      {/* Step 2: Tier Selection */}
      {currentStep === 'select-tier' && (
        <div className="ww-signup-step">
          <AppTierComponent
            title="Choose Your Plan"
            subtitle="Select a plan that fits your needs. You can always change later."
            showCurrentPlan={false}
            onTierChanged={handleTierChanged}
            onCancel={handleBack}
            autoLoad={true}
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
