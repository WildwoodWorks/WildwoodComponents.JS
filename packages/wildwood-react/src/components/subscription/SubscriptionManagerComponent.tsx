import { useState, useEffect, useCallback } from 'react';
import type { Subscription } from '@wildwood/core';
import { SubscriptionStatus } from '@wildwood/core';
import { useSubscription } from '../../hooks/useSubscription.js';

export interface SubscriptionManagerComponentProps {
  autoLoad?: boolean;
  showPlanSelector?: boolean;
  onSubscriptionChange?: (subscription: Subscription) => void;
  className?: string;
}

/**
 * Full subscription management component - shows all subscriptions, history,
 * and plan management. More comprehensive than SubscriptionComponent.
 */
export function SubscriptionManagerComponent({
  autoLoad = true,
  showPlanSelector = true,
  onSubscriptionChange,
  className,
}: SubscriptionManagerComponentProps) {
  const {
    plans,
    subscriptions,
    loading,
    error,
    getPlans,
    getUserSubscriptions,
    getSubscription,
    subscribe,
    cancelSubscription,
    changePlan,
  } = useSubscription();

  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ action: string; id: string } | null>(null);

  useEffect(() => {
    if (autoLoad) {
      getPlans();
      getUserSubscriptions();
    }
  }, [autoLoad, getPlans, getUserSubscriptions]);

  const handleViewDetails = useCallback(
    async (subscriptionId: string) => {
      const sub = await getSubscription(subscriptionId);
      setSelectedSubscription(sub);
    },
    [getSubscription],
  );

  const handleSubscribe = useCallback(
    async (planId: string) => {
      setActionMessage(null);
      try {
        const result = await subscribe(planId);
        if (result.isSuccess) {
          setActionMessage({ type: 'success', text: 'Subscribed successfully!' });
        } else {
          setActionMessage({ type: 'error', text: result.errorMessage ?? 'Failed to subscribe' });
        }
      } catch (err) {
        setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to subscribe' });
      }
      setConfirmAction(null);
    },
    [subscribe],
  );

  const handleCancel = useCallback(
    async (subscriptionId: string) => {
      setActionMessage(null);
      try {
        const result = await cancelSubscription(subscriptionId);
        if (result.isSuccess) {
          setActionMessage({ type: 'success', text: 'Subscription cancelled' });
          onSubscriptionChange?.(subscriptions.find((s) => s.id === subscriptionId)!);
        } else {
          setActionMessage({ type: 'error', text: result.errorMessage ?? 'Failed to cancel' });
        }
      } catch (err) {
        setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to cancel' });
      }
      setConfirmAction(null);
    },
    [cancelSubscription, subscriptions, onSubscriptionChange],
  );

  const handleChangePlan = useCallback(
    async (subscriptionId: string, newPlanId: string) => {
      setActionMessage(null);
      try {
        const result = await changePlan(subscriptionId, newPlanId);
        if (result.isSuccess) {
          setActionMessage({ type: 'success', text: 'Plan changed successfully!' });
        } else {
          setActionMessage({ type: 'error', text: result.errorMessage ?? 'Failed to change plan' });
        }
      } catch (err) {
        setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to change plan' });
      }
    },
    [changePlan],
  );

  const getStatusBadge = (status: SubscriptionStatus) => {
    switch (status) {
      case SubscriptionStatus.Active:
        return 'ww-badge-success';
      case SubscriptionStatus.Cancelled:
        return 'ww-badge-danger';
      case SubscriptionStatus.PendingPayment:
        return 'ww-badge-warning';
      default:
        return 'ww-badge-secondary';
    }
  };

  return (
    <div className={`ww-subscription-manager ${className ?? ''}`}>
      {(error || actionMessage?.type === 'error') && (
        <div className="ww-alert ww-alert-danger">{error || actionMessage?.text}</div>
      )}
      {actionMessage?.type === 'success' && <div className="ww-alert ww-alert-success">{actionMessage.text}</div>}

      {/* Subscription List */}
      <div className="ww-subscription-list">
        <h3>Your Subscriptions</h3>
        {loading && subscriptions.length === 0 && <p className="ww-text-muted">Loading...</p>}
        {!loading && subscriptions.length === 0 && <p className="ww-text-muted">No subscriptions found.</p>}
        {subscriptions.map((sub) => (
          <div key={sub.id} className="ww-subscription-card">
            <div className="ww-subscription-info">
              <div>
                <strong>{sub.planName}</strong>
                <span className={`ww-badge ${getStatusBadge(sub.status)}`}>{sub.status}</span>
              </div>
              {sub.startDate && (
                <small className="ww-text-muted">Since {new Date(sub.startDate).toLocaleDateString()}</small>
              )}
              {sub.nextBillingDate && (
                <small className="ww-text-muted">
                  Next billing: {new Date(sub.nextBillingDate).toLocaleDateString()}
                </small>
              )}
            </div>
            <div className="ww-subscription-actions">
              <button
                type="button"
                className="ww-btn ww-btn-sm ww-btn-outline"
                onClick={() => handleViewDetails(sub.id)}
              >
                Details
              </button>
              {sub.status === SubscriptionStatus.Active && (
                <button
                  type="button"
                  className="ww-btn ww-btn-sm ww-btn-danger"
                  onClick={() => setConfirmAction({ action: 'cancel', id: sub.id })}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Confirm Dialog */}
      {confirmAction && (
        <div className="ww-modal-overlay">
          <div className="ww-modal">
            <h4>Confirm {confirmAction.action === 'cancel' ? 'Cancellation' : 'Action'}</h4>
            <p>Are you sure you want to {confirmAction.action} this subscription?</p>
            <div className="ww-modal-actions">
              <button
                type="button"
                className="ww-btn ww-btn-danger"
                onClick={() => {
                  if (confirmAction.action === 'cancel') handleCancel(confirmAction.id);
                }}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Confirm'}
              </button>
              <button type="button" className="ww-btn ww-btn-outline" onClick={() => setConfirmAction(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Details */}
      {selectedSubscription && (
        <div className="ww-subscription-details">
          <h4>Subscription Details</h4>
          <dl className="ww-detail-list">
            <dt>Plan</dt>
            <dd>{selectedSubscription.planName}</dd>
            <dt>Status</dt>
            <dd>
              <span className={`ww-badge ${getStatusBadge(selectedSubscription.status)}`}>
                {selectedSubscription.status}
              </span>
            </dd>
            {selectedSubscription.startDate && (
              <>
                <dt>Period Start</dt>
                <dd>{new Date(selectedSubscription.startDate).toLocaleDateString()}</dd>
              </>
            )}
            {selectedSubscription.endDate && (
              <>
                <dt>Period End</dt>
                <dd>{new Date(selectedSubscription.endDate).toLocaleDateString()}</dd>
              </>
            )}
            {selectedSubscription.nextBillingDate && (
              <>
                <dt>Next Billing</dt>
                <dd>{new Date(selectedSubscription.nextBillingDate).toLocaleDateString()}</dd>
              </>
            )}
          </dl>

          {/* Plan Change */}
          {selectedSubscription.status === SubscriptionStatus.Active && showPlanSelector && plans.length > 1 && (
            <div className="ww-plan-change">
              <h5>Change Plan</h5>
              <div className="ww-plan-options">
                {plans
                  .filter((p) => p.id !== selectedSubscription.planId)
                  .map((plan) => (
                    <div key={plan.id} className="ww-plan-option">
                      <span>
                        {plan.name} - ${plan.price}/{plan.billingInterval ?? 'month'}
                      </span>
                      <button
                        type="button"
                        className="ww-btn ww-btn-sm ww-btn-primary"
                        onClick={() => handleChangePlan(selectedSubscription.id, plan.id)}
                        disabled={loading}
                      >
                        Switch
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <button type="button" className="ww-btn ww-btn-outline" onClick={() => setSelectedSubscription(null)}>
            Close
          </button>
        </div>
      )}

      {/* Available Plans (for new subscriptions) */}
      {showPlanSelector && subscriptions.length === 0 && plans.length > 0 && (
        <div className="ww-available-plans">
          <h3>Available Plans</h3>
          <div className="ww-plan-grid">
            {plans.map((plan) => (
              <div key={plan.id} className="ww-plan-card">
                <div className="ww-plan-header">
                  <h4>{plan.name}</h4>
                  <div className="ww-plan-price">
                    ${plan.price}
                    <span>/{plan.billingInterval ?? 'month'}</span>
                  </div>
                </div>
                {plan.description && <p className="ww-plan-description">{plan.description}</p>}
                {plan.features && plan.features.length > 0 && (
                  <ul className="ww-plan-features">
                    {plan.features.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className="ww-btn ww-btn-primary ww-btn-block"
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={loading}
                >
                  Subscribe
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
