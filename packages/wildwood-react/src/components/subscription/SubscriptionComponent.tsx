import { useState, useEffect, useCallback } from 'react';
import { SubscriptionStatus, BillingInterval } from '@wildwood/core';
import type { SubscriptionPlan } from '@wildwood/core';
import { useSubscription } from '../../hooks/useSubscription.js';
import { PaymentComponent } from '../payment/PaymentComponent.js';

type Step = 'plans' | 'payment' | 'success' | 'cancel-confirm';

export interface SubscriptionComponentProps {
  appId?: string;
  title?: string;
  subtitle?: string;
  customerId?: string;
  showBillingToggle?: boolean;
  showCurrentSubscription?: boolean;
  currency?: string;
  annualDiscount?: number;
  onSubscriptionChange?: () => void;
  onSubscriptionCancelled?: (subscriptionId: string) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
  autoLoad?: boolean;
  className?: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '\u20AC',
  GBP: '\u00A3',
  JPY: '\u00A5',
  INR: '\u20B9',
};

function formatPrice(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '$';
  return currency === 'JPY' ? `${symbol}${Math.round(amount)}` : `${symbol}${amount.toFixed(2)}`;
}

export function SubscriptionComponent({
  title,
  subtitle,
  customerId,
  showBillingToggle = true,
  showCurrentSubscription = true,
  currency = 'USD',
  annualDiscount,
  onSubscriptionChange,
  onSubscriptionCancelled,
  onError,
  onCancel,
  autoLoad = true,
  className,
}: SubscriptionComponentProps) {
  const {
    plans,
    subscriptions,
    loading,
    error,
    getPlans,
    getUserSubscriptions,
    subscribe,
    cancelSubscription,
    changePlan,
  } = useSubscription();

  const [step, setStep] = useState<Step>('plans');
  const [billingAnnual, setBillingAnnual] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const activeSubscription =
    subscriptions.find((s) => s.status === SubscriptionStatus.Active) ??
    subscriptions.find((s) => s.status === SubscriptionStatus.Trial) ??
    subscriptions[0] ??
    null;

  useEffect(() => {
    if (autoLoad) {
      getPlans();
      getUserSubscriptions();
    }
  }, [autoLoad, getPlans, getUserSubscriptions]);

  // Propagate errors
  useEffect(() => {
    if (actionError) onError?.(actionError);
  }, [actionError, onError]);

  const getDisplayPrice = useCallback(
    (plan: SubscriptionPlan): { price: number; interval: string } => {
      if (plan.isFree) return { price: 0, interval: '' };
      if (billingAnnual && plan.monthlyEquivalent) {
        return { price: plan.price, interval: 'year' };
      }
      return { price: plan.price, interval: plan.billingInterval?.toLowerCase() ?? 'month' };
    },
    [billingAnnual],
  );

  const getAnnualSavings = useCallback(
    (plan: SubscriptionPlan): number | null => {
      if (annualDiscount) return annualDiscount;
      if (!plan.monthlyEquivalent || plan.isFree) return null;
      const monthlyTotal = plan.monthlyEquivalent * 12;
      const annualPrice = plan.price;
      if (annualPrice < monthlyTotal) {
        return Math.round(((monthlyTotal - annualPrice) / monthlyTotal) * 100);
      }
      return null;
    },
    [annualDiscount],
  );

  const handleSelectPlan = useCallback(
    async (plan: SubscriptionPlan) => {
      setActionError(null);
      setSelectedPlan(plan);

      if (plan.isFree) {
        // Free plan: subscribe directly
        setActionLoading(true);
        try {
          const result = await subscribe(plan.id);
          if (result.isSuccess) {
            setSuccessMessage('Subscribed to free plan!');
            setStep('success');
            onSubscriptionChange?.();
          } else {
            setActionError(result.errorMessage ?? 'Subscription failed');
          }
        } catch (err) {
          setActionError(err instanceof Error ? err.message : 'Subscription failed');
        } finally {
          setActionLoading(false);
        }
        return;
      }

      // Paid plan: if already subscribed, change plan; otherwise go to payment step
      if (activeSubscription) {
        setActionLoading(true);
        try {
          const result = await changePlan(activeSubscription.id, plan.id);
          if (result.isSuccess) {
            setSuccessMessage(`Switched to ${plan.name}!`);
            setStep('success');
            onSubscriptionChange?.();
          } else {
            setActionError(result.errorMessage ?? 'Plan change failed');
          }
        } catch (err) {
          setActionError(err instanceof Error ? err.message : 'Plan change failed');
        } finally {
          setActionLoading(false);
        }
      } else {
        // New subscription: show payment step
        setStep('payment');
      }
    },
    [activeSubscription, subscribe, changePlan, onSubscriptionChange],
  );

  const handlePaymentSuccess = useCallback(async () => {
    if (!selectedPlan) return;
    setActionLoading(true);
    try {
      const result = await subscribe(selectedPlan.id);
      if (result.isSuccess) {
        setSuccessMessage(`Subscribed to ${selectedPlan.name}!`);
        setStep('success');
        onSubscriptionChange?.();
      } else if (result.paymentUrl) {
        const url = new URL(result.paymentUrl, window.location.origin);
        if (url.protocol === 'https:' || url.protocol === 'http:') {
          window.location.href = url.href;
        } else {
          setActionError('Invalid payment URL');
        }
      } else {
        setActionError(result.errorMessage ?? 'Subscription failed');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Subscription failed');
    } finally {
      setActionLoading(false);
    }
  }, [selectedPlan, subscribe, onSubscriptionChange]);

  const handleCancelSubscription = useCallback(async () => {
    if (!activeSubscription) return;
    setActionError(null);
    setActionLoading(true);
    try {
      const result = await cancelSubscription(activeSubscription.id);
      if (result.isSuccess) {
        setSuccessMessage('Your subscription has been cancelled.');
        setStep('success');
        onSubscriptionChange?.();
        onSubscriptionCancelled?.(activeSubscription.id);
      } else {
        setActionError(result.errorMessage ?? 'Cancellation failed');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Cancellation failed');
    } finally {
      setActionLoading(false);
    }
  }, [activeSubscription, cancelSubscription, onSubscriptionChange, onSubscriptionCancelled]);

  // Success view
  if (step === 'success') {
    return (
      <div className={`ww-subscription-component ${className ?? ''}`}>
        <div className="ww-subscription-success">
          <div className="ww-subscription-success-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h3>{successMessage || 'Subscription updated!'}</h3>
          <button
            type="button"
            className="ww-btn ww-btn-primary"
            onClick={() => {
              setStep('plans');
              getUserSubscriptions();
            }}
          >
            Back to Plans
          </button>
        </div>
      </div>
    );
  }

  // Cancel confirmation view
  if (step === 'cancel-confirm') {
    return (
      <div className={`ww-subscription-component ${className ?? ''}`}>
        <div className="ww-subscription-cancel-confirm">
          <h3>Cancel Subscription</h3>
          <p>
            Are you sure you want to cancel your <strong>{activeSubscription?.planName}</strong> subscription?
          </p>
          {activeSubscription?.endDate && (
            <p className="ww-text-muted">
              Your subscription will remain active until {new Date(activeSubscription.endDate).toLocaleDateString()}.
            </p>
          )}
          {actionError && <div className="ww-alert ww-alert-danger">{actionError}</div>}
          <div className="ww-subscription-cancel-actions">
            <button
              type="button"
              className="ww-btn ww-btn-danger"
              onClick={handleCancelSubscription}
              disabled={actionLoading}
            >
              {actionLoading ? 'Cancelling...' : 'Yes, Cancel Subscription'}
            </button>
            <button
              type="button"
              className="ww-btn ww-btn-outline"
              onClick={() => setStep('plans')}
              disabled={actionLoading}
            >
              Keep Subscription
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Payment step
  if (step === 'payment' && selectedPlan) {
    const { price, interval } = getDisplayPrice(selectedPlan);
    return (
      <div className={`ww-subscription-component ${className ?? ''}`}>
        <div className="ww-subscription-payment-step">
          <div className="ww-subscription-payment-layout">
            {/* Order Summary */}
            <div className="ww-subscription-order-summary">
              <h4>Order Summary</h4>
              <div className="ww-order-summary-card">
                <div className="ww-order-summary-plan">
                  <span className="ww-order-summary-name">{selectedPlan.name}</span>
                  <span className="ww-order-summary-price">
                    {formatPrice(price, selectedPlan.currency ?? currency)}/{interval}
                  </span>
                </div>
                {selectedPlan.description && <p className="ww-text-muted ww-text-sm">{selectedPlan.description}</p>}
                {selectedPlan.trialDays && (
                  <div className="ww-order-summary-trial">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    {selectedPlan.trialDays}-day free trial included
                  </div>
                )}
                {billingAnnual &&
                  (() => {
                    const savings = getAnnualSavings(selectedPlan);
                    return savings ? (
                      <div className="ww-order-summary-discount">
                        <span>Annual discount</span>
                        <span className="ww-text-success">-{savings}%</span>
                      </div>
                    ) : null;
                  })()}
                <div className="ww-order-summary-total">
                  <span>Total</span>
                  <span>
                    {formatPrice(price, selectedPlan.currency ?? currency)}/{interval}
                  </span>
                </div>
                {selectedPlan.features && selectedPlan.features.length > 0 && (
                  <div className="ww-order-summary-features">
                    <h5>What&apos;s included</h5>
                    <ul>
                      {selectedPlan.features.map((f, i) => (
                        <li key={i}>
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Form */}
            <div className="ww-subscription-payment-form">
              <h4>Payment Details</h4>
              <PaymentComponent amount={price} customerId={customerId} onPaymentSuccess={handlePaymentSuccess} />
            </div>
          </div>

          <div className="ww-subscription-payment-back">
            <button type="button" className="ww-btn ww-btn-link" onClick={() => setStep('plans')}>
              &larr; Back to Plans
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main plans view
  return (
    <div className={`ww-subscription-component ${className ?? ''}`}>
      {(title || subtitle) && (
        <div className="ww-subscription-header">
          {title && <h2 className="ww-subscription-title">{title}</h2>}
          {subtitle && <p className="ww-subscription-subtitle">{subtitle}</p>}
        </div>
      )}

      {(error || actionError) && (
        <div className="ww-alert ww-alert-danger">
          {error || actionError}
          {actionError && (
            <button type="button" className="ww-alert-dismiss" onClick={() => setActionError(null)}>
              &times;
            </button>
          )}
        </div>
      )}

      {/* Current Subscription */}
      {showCurrentSubscription && activeSubscription && (
        <div className="ww-subscription-current">
          <div className="ww-subscription-current-info">
            <div className="ww-subscription-current-details">
              <h4>Current Plan</h4>
              <div className="ww-subscription-current-name">
                <strong>{activeSubscription.planName}</strong>
                <span
                  className={`ww-badge ${
                    activeSubscription.status === SubscriptionStatus.Active
                      ? 'ww-badge-success'
                      : activeSubscription.status === SubscriptionStatus.Trial
                        ? 'ww-badge-info'
                        : 'ww-badge-warning'
                  }`}
                >
                  {activeSubscription.status}
                </span>
              </div>
              {activeSubscription.price > 0 && (
                <div className="ww-subscription-current-price">
                  {formatPrice(activeSubscription.price, activeSubscription.currency ?? currency)}
                  <span className="ww-text-muted">/{activeSubscription.billingInterval?.toLowerCase() ?? 'month'}</span>
                </div>
              )}
              {activeSubscription.nextBillingDate && (
                <p className="ww-text-muted ww-text-sm">
                  Next billing: {new Date(activeSubscription.nextBillingDate).toLocaleDateString()}
                </p>
              )}
            </div>
            {activeSubscription.status === SubscriptionStatus.Active && (
              <button
                type="button"
                className="ww-btn ww-btn-sm ww-btn-outline ww-btn-danger"
                onClick={() => setStep('cancel-confirm')}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Billing Toggle */}
      {showBillingToggle && plans.some((p) => p.monthlyEquivalent) && (
        <div className="ww-subscription-billing-toggle">
          <span className={!billingAnnual ? 'ww-billing-active' : ''}>Monthly</span>
          <button
            type="button"
            className={`ww-toggle ${billingAnnual ? 'ww-toggle-on' : ''}`}
            onClick={() => setBillingAnnual(!billingAnnual)}
            aria-label="Toggle annual billing"
          >
            <span className="ww-toggle-slider" />
          </button>
          <span className={billingAnnual ? 'ww-billing-active' : ''}>
            Annual
            {(() => {
              const maxSavings = plans.reduce((max, p) => {
                const s = getAnnualSavings(p);
                return s && s > max ? s : max;
              }, 0);
              return maxSavings > 0 ? (
                <span className="ww-badge ww-badge-success ww-badge-sm">Save up to {maxSavings}%</span>
              ) : null;
            })()}
          </span>
        </div>
      )}

      {/* Plans Grid */}
      {loading ? (
        <div className="ww-subscription-loading">
          <div className="ww-spinner" />
          <span>Loading plans...</span>
        </div>
      ) : (
        <div className="ww-plan-grid">
          {plans.map((plan) => {
            const isCurrentPlan = activeSubscription?.planId === plan.id;
            const { price, interval } = getDisplayPrice(plan);
            const savings = billingAnnual ? getAnnualSavings(plan) : null;

            return (
              <div
                key={plan.id}
                className={`ww-plan-card ${isCurrentPlan ? 'ww-plan-current' : ''} ${plan.isRecommended ? 'ww-plan-recommended' : ''} ${selectedPlan?.id === plan.id ? 'ww-plan-selected' : ''}`}
              >
                {plan.isRecommended && <div className="ww-plan-recommended-badge">Recommended</div>}
                <div className="ww-plan-header">
                  <h3>{plan.name}</h3>
                  <div className="ww-plan-price">
                    {plan.isFree ? (
                      <span className="ww-plan-price-amount">Free</span>
                    ) : (
                      <>
                        <span className="ww-plan-price-amount">{formatPrice(price, plan.currency ?? currency)}</span>
                        {interval && <span className="ww-plan-price-interval">/{interval}</span>}
                      </>
                    )}
                  </div>
                  {savings && <div className="ww-plan-savings">Save {savings}%</div>}
                  {plan.trialDays && !isCurrentPlan && (
                    <div className="ww-plan-trial">{plan.trialDays}-day free trial</div>
                  )}
                </div>

                {plan.description && <p className="ww-plan-description">{plan.description}</p>}

                {plan.features && plan.features.length > 0 && (
                  <ul className="ww-plan-features">
                    {plan.features.map((f, i) => (
                      <li key={i} className="ww-plan-feature-item">
                        <svg
                          className="ww-plan-feature-check"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                )}

                {plan.limitations && plan.limitations.length > 0 && (
                  <ul className="ww-plan-limitations">
                    {plan.limitations.map((l, i) => (
                      <li key={i} className="ww-plan-limitation-item">
                        <svg
                          className="ww-plan-limitation-x"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                        {l}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="ww-plan-footer">
                  {isCurrentPlan ? (
                    <span className="ww-badge ww-badge-success">Current Plan</span>
                  ) : (
                    <button
                      type="button"
                      className={`ww-btn ${plan.isRecommended ? 'ww-btn-primary' : 'ww-btn-outline'} ww-btn-block`}
                      onClick={() => handleSelectPlan(plan)}
                      disabled={actionLoading}
                    >
                      {actionLoading && selectedPlan?.id === plan.id
                        ? 'Processing...'
                        : activeSubscription
                          ? 'Switch Plan'
                          : plan.isFree
                            ? 'Get Started Free'
                            : 'Subscribe'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {onCancel && (
        <div className="ww-subscription-footer">
          <button type="button" className="ww-btn ww-btn-link" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
