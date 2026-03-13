// SubscriptionStatusPanel - ported from WildwoodComponents.Blazor Subscription/Admin/SubscriptionStatusPanel.razor

import { useState } from 'react';
import type { UserTierSubscriptionModel } from '@wildwood/core';

export interface SubscriptionStatusPanelProps {
  subscription: UserTierSubscriptionModel | null;
  loading?: boolean;
  onCancelRequested?: () => Promise<void>;
  className?: string;
}

const STATUS_BADGE: Record<string, string> = {
  Active: 'ww-badge-success',
  Trialing: 'ww-badge-info',
  PastDue: 'ww-badge-warning',
  Cancelled: 'ww-badge-danger',
  Expired: 'ww-badge-secondary',
};

export function SubscriptionStatusPanel({
  subscription,
  loading,
  onCancelRequested,
  className,
}: SubscriptionStatusPanelProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (loading) {
    return (
      <div className={`ww-sub-status-panel ${className ?? ''}`}>
        <div className="ww-loading">
          <div className="ww-spinner" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className={`ww-sub-status-panel ${className ?? ''}`}>
        <div className="ww-alert ww-alert-info">No active subscription found.</div>
      </div>
    );
  }

  const handleConfirmCancel = async () => {
    setCancelling(true);
    try {
      await onCancelRequested?.();
      setShowCancelConfirm(false);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className={`ww-sub-status-panel ${className ?? ''}`}>
      <div className="ww-sub-status-header">
        <div className="ww-sub-status-info">
          <h4 className="ww-sub-status-tier-name">{subscription.tierName}</h4>
          <span className={`ww-badge ${STATUS_BADGE[subscription.status] ?? 'ww-badge-secondary'}`}>
            {subscription.status}
          </span>
          {subscription.isFreeTier && <span className="ww-badge ww-badge-secondary">Free</span>}
        </div>
        {!subscription.isFreeTier && subscription.status === 'Active' && onCancelRequested && (
          <button
            type="button"
            className="ww-btn ww-btn-sm ww-btn-outline ww-btn-danger"
            onClick={() => setShowCancelConfirm(true)}
          >
            Cancel Subscription
          </button>
        )}
      </div>

      {subscription.tierDescription && <p className="ww-text-muted ww-text-sm">{subscription.tierDescription}</p>}

      <div className="ww-sub-status-details">
        <div className="ww-sub-status-field">
          <span className="ww-sub-status-label">Start Date</span>
          <span>{new Date(subscription.startDate).toLocaleDateString()}</span>
        </div>
        {subscription.currentPeriodEnd && (
          <div className="ww-sub-status-field">
            <span className="ww-sub-status-label">Current Period Ends</span>
            <span>{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</span>
          </div>
        )}
        {subscription.trialEndDate && (
          <div className="ww-sub-status-field">
            <span className="ww-sub-status-label">Trial Ends</span>
            <span>{new Date(subscription.trialEndDate).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {subscription.pendingTierName && (
        <div className="ww-alert ww-alert-info ww-sub-status-pending">
          Pending change to <strong>{subscription.pendingTierName}</strong>
          {subscription.pendingChangeDate && ` on ${new Date(subscription.pendingChangeDate).toLocaleDateString()}`}
        </div>
      )}

      {/* Cancel confirmation modal */}
      {showCancelConfirm && (
        <div className="ww-modal-overlay">
          <div className="ww-modal">
            <div className="ww-modal-header">
              <h4>Cancel Subscription</h4>
            </div>
            <div className="ww-modal-body">
              <p>
                Are you sure you want to cancel the <strong>{subscription.tierName}</strong> subscription?
              </p>
              {subscription.currentPeriodEnd && (
                <p className="ww-text-muted">
                  Access will continue until {new Date(subscription.currentPeriodEnd).toLocaleDateString()}.
                </p>
              )}
            </div>
            <div className="ww-modal-footer">
              <button
                type="button"
                className="ww-btn ww-btn-outline"
                onClick={() => setShowCancelConfirm(false)}
                disabled={cancelling}
              >
                Keep Subscription
              </button>
              <button
                type="button"
                className="ww-btn ww-btn-danger"
                onClick={handleConfirmCancel}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
