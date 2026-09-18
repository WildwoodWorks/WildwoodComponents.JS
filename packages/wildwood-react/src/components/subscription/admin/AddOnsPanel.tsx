// AddOnsPanel - ported from WildwoodComponents.Blazor Subscription/Admin/AddOnsPanel.razor

import { useState } from 'react';
import { formatMoney, trialLabel } from '@wildwood/core';
import type { AppTierAddOnModel, UserAddOnSubscriptionModel } from '@wildwood/core';
import { grantsAccess } from '@wildwood/react-shared';

export interface AddOnsPanelProps {
  addOns: AppTierAddOnModel[];
  subscriptions: UserAddOnSubscriptionModel[];
  currentTierId?: string;
  loading?: boolean;
  /** Fallback currency for a pack that does not carry its own. */
  currency?: string;
  /**
   * Subscribe to a pack. Resolve `false` (or reject) to report the failure: the panel surfaces it
   * inline instead of looking as if the purchase went through.
   */
  onSubscribe?: (addOnId: string, pricingId?: string) => Promise<boolean | void>;
  /** Cancel a pack subscription. Resolve `false` (or reject) to report the failure. */
  onCancel?: (subscriptionId: string) => Promise<boolean | void>;
  className?: string;
}

export function AddOnsPanel({
  addOns,
  subscriptions,
  currentTierId,
  loading,
  currency = 'USD',
  onSubscribe,
  onCancel,
  className,
}: AddOnsPanelProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  // Failure of the last subscribe/cancel attempt. Cleared when the next attempt starts, so a retry
  // never shows a stale message.
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className={`ww-addons-panel ${className ?? ''}`}>
        <div className="ww-loading">
          <div className="ww-spinner" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // One access-granting rule for both lists: a pack whose row is Cancelled or Expired is on offer
  // again, and one scheduled to cancel is still owned (so it is not offered for purchase twice).
  const isSubscribed = (addOnId: string) =>
    subscriptions.some((s) => s.appTierAddOnId?.toLowerCase() === addOnId?.toLowerCase() && grantsAccess(s.status));

  const isBundled = (addOn: AppTierAddOnModel) =>
    currentTierId ? addOn.bundledInTierIds?.some((id) => id?.toLowerCase() === currentTierId?.toLowerCase()) : false;

  const failureMessage = (err: unknown, fallback: string) =>
    err instanceof Error && err.message ? err.message : fallback;

  const handleSubscribe = async (addOn: AppTierAddOnModel, pricingId?: string) => {
    setActionError(null);
    setProcessingId(addOn.id);
    try {
      const result = await onSubscribe?.(addOn.id, pricingId);
      if (result === false) {
        setActionError(`Could not subscribe to ${addOn.name}. Please try again.`);
      }
    } catch (err: unknown) {
      setActionError(failureMessage(err, `Could not subscribe to ${addOn.name}. Please try again.`));
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (sub: UserAddOnSubscriptionModel) => {
    setActionError(null);
    setProcessingId(sub.id);
    try {
      const result = await onCancel?.(sub.id);
      if (result === false) {
        setActionError(`Could not cancel ${sub.addOnName}. Please try again.`);
      }
    } catch (err: unknown) {
      setActionError(failureMessage(err, `Could not cancel ${sub.addOnName}. Please try again.`));
    } finally {
      setProcessingId(null);
    }
  };

  // Split into active and available
  const activeAddOns = subscriptions.filter((s) => grantsAccess(s.status));
  const availableAddOns = addOns.filter((a) => !isSubscribed(a.id));

  return (
    <div className={`ww-addons-panel ${className ?? ''}`}>
      {actionError && (
        <div className="ww-alert ww-alert-danger ww-addons-error" role="alert">
          {actionError}
        </div>
      )}

      {/* Active Add-Ons */}
      {activeAddOns.length > 0 && (
        <div className="ww-addons-section">
          <h5>Active Add-Ons</h5>
          <div className="ww-addons-grid">
            {activeAddOns.map((sub) => {
              const cancelling = sub.status === 'PendingCancellation';
              return (
                <div key={sub.id} className="ww-addon-card ww-addon-active">
                  <div className="ww-addon-header">
                    <span className="ww-addon-name">{sub.addOnName}</span>
                    <span
                      className={`ww-badge ${
                        sub.isBundled ? 'ww-badge-info' : cancelling ? 'ww-badge-warning' : 'ww-badge-success'
                      }`}
                    >
                      {sub.isBundled ? 'Bundled' : cancelling ? 'Cancellation Scheduled' : sub.status}
                    </span>
                  </div>
                  {sub.addOnDescription && <p className="ww-text-muted ww-text-sm">{sub.addOnDescription}</p>}
                  <div className="ww-addon-dates ww-text-sm ww-text-muted">
                    Started: {new Date(sub.startDate).toLocaleDateString()}
                    {sub.endDate ? (
                      <>
                        {' | '}
                        {cancelling ? 'Cancels on' : 'Renews'}: {new Date(sub.endDate).toLocaleDateString()}
                      </>
                    ) : (
                      // A scheduled cancellation still has to be visible when the server sent no date.
                      cancelling && <> | Cancels at the end of the billing period</>
                    )}
                  </div>
                  {!sub.isBundled && !cancelling && onCancel && (
                    <button
                      type="button"
                      className="ww-btn ww-btn-sm ww-btn-outline ww-btn-danger"
                      onClick={() => handleCancel(sub)}
                      disabled={processingId === sub.id}
                    >
                      {processingId === sub.id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available Add-Ons */}
      {availableAddOns.length > 0 && (
        <div className="ww-addons-section">
          <h5>Available Add-Ons</h5>
          <div className="ww-addons-grid">
            {availableAddOns.map((addOn) => {
              const bundled = isBundled(addOn);
              const pricing = addOn.pricingOptions?.find((p) => p.isDefault) ?? addOn.pricingOptions?.[0];
              // The processor's trial comes from the pricing option that is bought; the pack-level
              // value is only a fallback for a pack whose options carry none.
              const trial = trialLabel(pricing?.trialDays ?? addOn.trialDays);

              return (
                <div key={addOn.id} className="ww-addon-card">
                  <div className="ww-addon-header">
                    {addOn.iconClass && <span className={`ww-addon-icon ${addOn.iconClass}`} />}
                    <span className="ww-addon-name">{addOn.name}</span>
                    {addOn.category && <span className="ww-badge ww-badge-secondary">{addOn.category}</span>}
                  </div>
                  {addOn.description && <p className="ww-text-muted ww-text-sm">{addOn.description}</p>}
                  {addOn.features?.length > 0 && (
                    <ul className="ww-addon-features">
                      {addOn.features.map((f) => (
                        <li key={f.id}>
                          <span className="ww-icon-check" /> {f.displayName}
                        </li>
                      ))}
                    </ul>
                  )}
                  {pricing && (
                    <div className="ww-addon-price">
                      {formatMoney(pricing.price, addOn.currency ?? currency)}/
                      {pricing.billingFrequency?.toLowerCase() ?? 'month'}
                    </div>
                  )}
                  {trial && <div className="ww-addon-trial ww-text-sm ww-text-muted">{trial}</div>}
                  <div className="ww-addon-footer">
                    {bundled ? (
                      <span className="ww-badge ww-badge-info">Included in Plan</span>
                    ) : (
                      <button
                        type="button"
                        className="ww-btn ww-btn-primary ww-btn-sm"
                        onClick={() => handleSubscribe(addOn, pricing?.id)}
                        disabled={processingId === addOn.id}
                      >
                        {processingId === addOn.id ? 'Subscribing...' : 'Subscribe'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!activeAddOns.length && !availableAddOns.length && (
        <div className="ww-alert ww-alert-info">No add-ons available.</div>
      )}
    </div>
  );
}
