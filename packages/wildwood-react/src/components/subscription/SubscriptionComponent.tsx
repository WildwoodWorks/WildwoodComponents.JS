import { useState, useEffect, useCallback } from 'react';
import { SubscriptionStatus } from '@wildwood/core';
import { useSubscription } from '../../hooks/useSubscription.js';

export interface SubscriptionComponentProps {
  autoLoad?: boolean;
  onSubscriptionChange?: () => void;
  className?: string;
}

export function SubscriptionComponent({
  autoLoad = true,
  onSubscriptionChange,
  className,
}: SubscriptionComponentProps) {
  const { plans, subscriptions, loading, error, getPlans, getUserSubscriptions, subscribe, cancelSubscription, changePlan } = useSubscription();
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const activeSubscription = subscriptions.find((s) => s.status === SubscriptionStatus.Active) ?? subscriptions[0] ?? null;

  useEffect(() => {
    if (autoLoad) {
      getPlans();
      getUserSubscriptions();
    }
  }, [autoLoad, getPlans, getUserSubscriptions]);

  const handleSubscribe = useCallback(async (planId: string) => {
    setActionError(null);
    setSuccessMessage('');
    try {
      const result = await subscribe(planId);
      if (result.isSuccess) {
        setSuccessMessage('Subscribed successfully!');
        onSubscriptionChange?.();
      } else {
        setActionError(result.errorMessage ?? 'Subscription failed');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Subscription failed');
    }
  }, [subscribe, onSubscriptionChange]);

  const handleCancel = useCallback(async () => {
    if (!activeSubscription) return;
    setActionError(null);
    setSuccessMessage('');
    try {
      const result = await cancelSubscription(activeSubscription.id);
      if (result.isSuccess) {
        setSuccessMessage('Subscription cancelled');
        onSubscriptionChange?.();
      } else {
        setActionError(result.errorMessage ?? 'Cancellation failed');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Cancellation failed');
    }
  }, [activeSubscription, cancelSubscription, onSubscriptionChange]);

  const handleChangePlan = useCallback(async (newPlanId: string) => {
    if (!activeSubscription) return;
    setActionError(null);
    setSuccessMessage('');
    try {
      const result = await changePlan(activeSubscription.id, newPlanId);
      if (result.isSuccess) {
        setSuccessMessage('Plan changed successfully!');
        onSubscriptionChange?.();
      } else {
        setActionError(result.errorMessage ?? 'Plan change failed');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Plan change failed');
    }
  }, [activeSubscription, changePlan, onSubscriptionChange]);

  return (
    <div className={`ww-subscription-component ${className ?? ''}`}>
      {(error || actionError) && <div className="ww-alert ww-alert-danger">{error || actionError}</div>}
      {successMessage && <div className="ww-alert ww-alert-success">{successMessage}</div>}

      {/* Current Subscription */}
      {activeSubscription && (
        <div className="ww-current-subscription">
          <h4>Current Subscription</h4>
          <div className="ww-subscription-card ww-active">
            <div className="ww-subscription-info">
              <strong>{activeSubscription.planName}</strong>
              <span className={`ww-badge ${activeSubscription.status === SubscriptionStatus.Active ? 'ww-badge-success' : 'ww-badge-warning'}`}>
                {activeSubscription.status}
              </span>
            </div>
            {activeSubscription.nextBillingDate && (
              <p className="ww-text-muted">
                Renews: {new Date(activeSubscription.nextBillingDate).toLocaleDateString()}
              </p>
            )}
            <button
              type="button"
              className="ww-btn ww-btn-danger ww-btn-sm"
              onClick={handleCancel}
              disabled={loading}
            >
              Cancel Subscription
            </button>
          </div>
        </div>
      )}

      {/* Available Plans */}
      {loading ? (
        <div className="ww-loading">Loading plans...</div>
      ) : (
        <div className="ww-plan-grid">
          {plans.map((plan) => {
            const isCurrentPlan = activeSubscription?.planId === plan.id;
            return (
              <div
                key={plan.id}
                className={`ww-plan-card ${isCurrentPlan ? 'ww-plan-current' : ''}`}
              >
                <div className="ww-plan-header">
                  <h3>{plan.name}</h3>
                  <div className="ww-plan-price">
                    ${plan.price}
                    <span>/{plan.billingInterval ?? 'month'}</span>
                  </div>
                </div>
                {plan.description && (
                  <p className="ww-plan-description">{plan.description}</p>
                )}
                {plan.features && plan.features.length > 0 && (
                  <ul className="ww-plan-features">
                    {plan.features.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                )}
                <div className="ww-plan-footer">
                  {isCurrentPlan ? (
                    <span className="ww-badge ww-badge-success">Current Plan</span>
                  ) : activeSubscription ? (
                    <button
                      type="button"
                      className="ww-btn ww-btn-primary"
                      onClick={() => handleChangePlan(plan.id)}
                      disabled={loading}
                    >
                      Switch to this plan
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ww-btn ww-btn-primary"
                      onClick={() => handleSubscribe(plan.id)}
                      disabled={loading}
                    >
                      Subscribe
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
