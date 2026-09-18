// AddOnsPanel - ported from WildwoodComponents.Blazor Subscription/Admin/AddOnsPanel.razor
//
// A pack row says how it is paid for, because that decides what cancelling it does. A row with no
// payment behind it was GRANTED - a registration token's pack, or an admin's - so nothing bills
// it, there is no renewal to show and nothing to reactivate at a provider; cancelling one simply
// removes it. A billed row keeps access to the end of the period it is paid up to, and a
// cancellation scheduled that way can be taken back.

import { useState } from 'react';
import { formatMoney, trialLabel } from '@wildwood/core';
import type { AppTierAddOnModel, UserAddOnSubscriptionModel } from '@wildwood/core';
import { grantsAccess } from '@wildwood/react-shared';

/** Copy the panel lets a host replace. Anything left out keeps the shipped words. */
export interface AddOnsPanelLabels {
  /** Badge on a pack nothing bills. */
  included?: string;
  /** Confirmation copy before cancelling a pack nothing bills. */
  cancelIncluded?: string;
  /** Confirmation copy before cancelling a billed pack. */
  cancelBilled?: string;
  /** Confirms the cancellation. */
  cancelConfirm?: string;
  /** Backs out of it. */
  cancelKeep?: string;
  /** Takes back a scheduled cancellation. */
  reactivate?: string;
  /** Opens the host's pack picker. */
  addPacks?: string;
}

const DEFAULT_ADDON_LABELS = {
  included: 'Included with your registration',
  cancelIncluded: 'This pack was included with your registration. Cancelling removes it from your account.',
  cancelBilled: 'You keep access until the end of the current billing period.',
  cancelConfirm: 'Cancel pack',
  cancelKeep: 'Keep pack',
  reactivate: 'Reactivate',
  addPacks: 'Add packs',
} satisfies Required<AddOnsPanelLabels>;

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
   *
   * Left out, no pack offers a one-click Subscribe: a surface that takes a card of its own offers
   * {@link AddOnsPanelProps.onAddPacks} instead.
   */
  onSubscribe?: (addOnId: string, pricingId?: string) => Promise<boolean | void>;
  /**
   * Cancel a pack subscription. Asked for twice - the row asks the user to confirm first, in the
   * words that fit how the pack is paid for. Resolve `false` (or reject) to report the failure.
   */
  onCancel?: (subscriptionId: string) => Promise<boolean | void>;
  /** Take back a scheduled cancellation. Only ever offered on a billed pack. */
  onReactivate?: (subscriptionId: string) => Promise<boolean | void>;
  /** Open the host's own pack picker. Given one, the panel offers "Add packs". */
  onAddPacks?: () => void;
  labels?: AddOnsPanelLabels;
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
  onReactivate,
  onAddPacks,
  labels,
  className,
}: AddOnsPanelProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  // Failure of the last subscribe/cancel attempt. Cleared when the next attempt starts, so a retry
  // never shows a stale message.
  const [actionError, setActionError] = useState<string | null>(null);
  // The row whose cancellation is being confirmed. Nothing is cancelled on the first click.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Which of the two row actions is in flight, so the row says what it is doing.
  const [processingAction, setProcessingAction] = useState<'cancel' | 'reactivate'>('cancel');
  const copy = { ...DEFAULT_ADDON_LABELS, ...labels };

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

  // Granted, not sold: no payment behind the row and no plan bundling it in.
  const isComplimentary = (sub: UserAddOnSubscriptionModel) => !sub.isBundled && !sub.paymentTransactionId;

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
    setConfirmingId(null);
    setProcessingAction('cancel');
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

  const handleReactivate = async (sub: UserAddOnSubscriptionModel) => {
    setActionError(null);
    setProcessingAction('reactivate');
    setProcessingId(sub.id);
    try {
      const result = await onReactivate?.(sub.id);
      if (result === false) {
        setActionError(`Could not reactivate ${sub.addOnName}. Please try again.`);
      }
    } catch (err: unknown) {
      setActionError(failureMessage(err, `Could not reactivate ${sub.addOnName}. Please try again.`));
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

      {onAddPacks && (
        <div className="ww-addons-header">
          <button type="button" className="ww-btn ww-btn-primary ww-btn-sm" onClick={onAddPacks}>
            {copy.addPacks}
          </button>
        </div>
      )}

      {/* Active Add-Ons */}
      {activeAddOns.length > 0 && (
        <div className="ww-addons-section">
          <h5>Active Add-Ons</h5>
          <div className="ww-addons-grid">
            {activeAddOns.map((sub) => {
              const cancelling = sub.status === 'PendingCancellation';
              const complimentary = isComplimentary(sub);
              // Nothing bills a granted pack, so there is no renewal date to promise.
              const showEndDate = !!sub.endDate && (cancelling || !complimentary);
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
                    {complimentary && <span className="ww-badge ww-badge-info ww-addon-included">{copy.included}</span>}
                  </div>
                  {sub.addOnDescription && <p className="ww-text-muted ww-text-sm">{sub.addOnDescription}</p>}
                  <div className="ww-addon-dates ww-text-sm ww-text-muted">
                    Started: {new Date(sub.startDate).toLocaleDateString()}
                    {showEndDate ? (
                      <>
                        {' | '}
                        {cancelling ? 'Cancels on' : 'Renews'}: {new Date(sub.endDate!).toLocaleDateString()}
                      </>
                    ) : (
                      // A scheduled cancellation still has to be visible when the server sent no date.
                      cancelling && <> | Cancels at the end of the billing period</>
                    )}
                  </div>
                  {processingId === sub.id ? (
                    <span className="ww-text-sm ww-text-muted">
                      {processingAction === 'reactivate' ? 'Reactivating...' : 'Cancelling...'}
                    </span>
                  ) : (
                    <>
                      {/* A scheduled cancellation on a billed pack can be taken back; a granted
                          pack has nothing at a provider to take back. */}
                      {cancelling && !sub.isBundled && !complimentary && onReactivate && (
                        <button
                          type="button"
                          className="ww-btn ww-btn-sm ww-btn-outline"
                          onClick={() => handleReactivate(sub)}
                        >
                          {copy.reactivate}
                        </button>
                      )}
                      {!sub.isBundled &&
                        !cancelling &&
                        onCancel &&
                        (confirmingId === sub.id ? (
                          <div className="ww-addon-confirm">
                            <p className="ww-addon-confirm-message ww-text-sm">
                              {complimentary ? copy.cancelIncluded : copy.cancelBilled}
                            </p>
                            <div className="ww-addon-confirm-actions">
                              <button
                                type="button"
                                className="ww-btn ww-btn-sm ww-btn-danger"
                                onClick={() => handleCancel(sub)}
                              >
                                {copy.cancelConfirm}
                              </button>
                              <button
                                type="button"
                                className="ww-btn ww-btn-sm ww-btn-outline"
                                onClick={() => setConfirmingId(null)}
                              >
                                {copy.cancelKeep}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="ww-btn ww-btn-sm ww-btn-outline ww-btn-danger"
                            onClick={() => setConfirmingId(sub.id)}
                          >
                            Cancel
                          </button>
                        ))}
                    </>
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
                    {bundled && <span className="ww-badge ww-badge-info">Included in Plan</span>}
                    {/* No one-click purchase without a handler: the button did nothing at all when
                        the surface buys packs through a checkout of its own instead. */}
                    {!bundled && onSubscribe && (
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
