// AddOnsPanel - ported from WildwoodComponents.Blazor Subscription/Admin/AddOnsPanel.razor

import { useState } from 'react';
import type { AppTierAddOnModel, UserAddOnSubscriptionModel } from '@wildwood/core';

export interface AddOnsPanelProps {
  addOns: AppTierAddOnModel[];
  subscriptions: UserAddOnSubscriptionModel[];
  currentTierId?: string;
  loading?: boolean;
  currency?: string;
  onSubscribe?: (addOnId: string, pricingId?: string) => Promise<void>;
  onCancel?: (subscriptionId: string) => Promise<void>;
  className?: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '\u20AC', GBP: '\u00A3', JPY: '\u00A5' };

function formatPrice(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '$';
  return currency === 'JPY' ? `${symbol}${Math.round(amount)}` : `${symbol}${amount.toFixed(2)}`;
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

  const isSubscribed = (addOnId: string) =>
    subscriptions.some((s) => s.appTierAddOnId === addOnId && s.status === 'Active');

  const isBundled = (addOn: AppTierAddOnModel) =>
    currentTierId ? addOn.bundledInTierIds?.includes(currentTierId) : false;

  const getSubscription = (addOnId: string) => subscriptions.find((s) => s.appTierAddOnId === addOnId);

  const handleSubscribe = async (addOnId: string, pricingId?: string) => {
    setProcessingId(addOnId);
    try {
      await onSubscribe?.(addOnId, pricingId);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (subscriptionId: string) => {
    setProcessingId(subscriptionId);
    try {
      await onCancel?.(subscriptionId);
    } finally {
      setProcessingId(null);
    }
  };

  // Split into active and available
  const activeAddOns = subscriptions.filter((s) => s.status === 'Active' || s.status === 'Trialing');
  const availableAddOns = addOns.filter((a) => !isSubscribed(a.id));

  return (
    <div className={`ww-addons-panel ${className ?? ''}`}>
      {/* Active Add-Ons */}
      {activeAddOns.length > 0 && (
        <div className="ww-addons-section">
          <h5>Active Add-Ons</h5>
          <div className="ww-addons-grid">
            {activeAddOns.map((sub) => (
              <div key={sub.id} className="ww-addon-card ww-addon-active">
                <div className="ww-addon-header">
                  <span className="ww-addon-name">{sub.addOnName}</span>
                  <span className={`ww-badge ${sub.isBundled ? 'ww-badge-info' : 'ww-badge-success'}`}>
                    {sub.isBundled ? 'Bundled' : sub.status}
                  </span>
                </div>
                {sub.addOnDescription && <p className="ww-text-muted ww-text-sm">{sub.addOnDescription}</p>}
                <div className="ww-addon-dates ww-text-sm ww-text-muted">
                  Started: {new Date(sub.startDate).toLocaleDateString()}
                  {sub.endDate && <> | Renews: {new Date(sub.endDate).toLocaleDateString()}</>}
                </div>
                {!sub.isBundled && onCancel && (
                  <button
                    type="button"
                    className="ww-btn ww-btn-sm ww-btn-outline ww-btn-danger"
                    onClick={() => handleCancel(sub.id)}
                    disabled={processingId === sub.id}
                  >
                    {processingId === sub.id ? 'Cancelling...' : 'Cancel'}
                  </button>
                )}
              </div>
            ))}
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
              const sub = getSubscription(addOn.id);

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
                      {formatPrice(pricing.price, currency)}/{pricing.billingFrequency?.toLowerCase() ?? 'month'}
                    </div>
                  )}
                  {addOn.trialDays && addOn.trialDays > 0 && (
                    <div className="ww-addon-trial ww-text-sm ww-text-muted">{addOn.trialDays}-day free trial</div>
                  )}
                  <div className="ww-addon-footer">
                    {bundled ? (
                      <span className="ww-badge ww-badge-info">Included in Plan</span>
                    ) : sub ? (
                      <span className="ww-badge ww-badge-success">Subscribed</span>
                    ) : (
                      <button
                        type="button"
                        className="ww-btn ww-btn-primary ww-btn-sm"
                        onClick={() => handleSubscribe(addOn.id, pricing?.id)}
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
