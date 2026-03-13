// TierPlansPanel - ported from WildwoodComponents.Blazor Subscription/Admin/TierPlansPanel.razor

import { useState, useCallback } from 'react';
import type { AppTierModel, AppTierPricingModel } from '@wildwood/core';

export interface TierSelectedEventArgs {
  tierId: string;
  tierName: string;
  pricingId?: string;
  price?: number;
  isFreeTier: boolean;
  isChange: boolean;
}

export interface TierPlansPanelProps {
  tiers: AppTierModel[];
  currentTierId?: string;
  loading?: boolean;
  showBillingToggle?: boolean;
  currency?: string;
  onTierSelected?: (args: TierSelectedEventArgs) => void;
  className?: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '\u20AC', GBP: '\u00A3', JPY: '\u00A5' };

function formatPrice(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '$';
  return currency === 'JPY' ? `${symbol}${Math.round(amount)}` : `${symbol}${amount.toFixed(2)}`;
}

export function TierPlansPanel({
  tiers,
  currentTierId,
  loading,
  showBillingToggle = true,
  currency = 'USD',
  onTierSelected,
  className,
}: TierPlansPanelProps) {
  const [billingAnnual, setBillingAnnual] = useState(false);
  const [processingTierId, setProcessingTierId] = useState<string | null>(null);

  const hasAnnual = tiers.some((t) =>
    t.pricingOptions?.some(
      (p) => p.billingFrequency?.toLowerCase() === 'yearly' || p.billingFrequency?.toLowerCase() === 'annual',
    ),
  );

  const getPricing = useCallback(
    (tier: AppTierModel): AppTierPricingModel | undefined => {
      if (!tier.pricingOptions?.length) return undefined;
      if (billingAnnual) {
        const annual = tier.pricingOptions.find(
          (p) => p.billingFrequency?.toLowerCase() === 'yearly' || p.billingFrequency?.toLowerCase() === 'annual',
        );
        if (annual) return annual;
      }
      return tier.pricingOptions.find((p) => p.isDefault) ?? tier.pricingOptions[0];
    },
    [billingAnnual],
  );

  const handleSelect = useCallback(
    async (tier: AppTierModel) => {
      const pricing = getPricing(tier);
      setProcessingTierId(tier.id);
      try {
        onTierSelected?.({
          tierId: tier.id,
          tierName: tier.name,
          pricingId: pricing?.id,
          price: pricing?.price,
          isFreeTier: tier.isFreeTier,
          isChange: !!currentTierId && currentTierId !== tier.id,
        });
      } finally {
        setProcessingTierId(null);
      }
    },
    [getPricing, currentTierId, onTierSelected],
  );

  if (loading) {
    return (
      <div className={`ww-tier-plans-panel ${className ?? ''}`}>
        <div className="ww-loading">
          <div className="ww-spinner" />
          <span>Loading plans...</span>
        </div>
      </div>
    );
  }

  if (!tiers.length) {
    return (
      <div className={`ww-tier-plans-panel ${className ?? ''}`}>
        <div className="ww-alert ww-alert-info">No plans available.</div>
      </div>
    );
  }

  return (
    <div className={`ww-tier-plans-panel ${className ?? ''}`}>
      {showBillingToggle && hasAnnual && (
        <div className="ww-apptier-billing-toggle">
          <span className={!billingAnnual ? 'ww-billing-active' : ''}>Monthly</span>
          <button
            type="button"
            className={`ww-toggle ${billingAnnual ? 'ww-toggle-on' : ''}`}
            onClick={() => setBillingAnnual(!billingAnnual)}
            aria-label="Toggle annual billing"
          >
            <span className="ww-toggle-slider" />
          </button>
          <span className={billingAnnual ? 'ww-billing-active' : ''}>Annual</span>
        </div>
      )}

      <div className="ww-tier-grid">
        {tiers.map((tier) => {
          const isCurrent = currentTierId === tier.id;
          const pricing = getPricing(tier);

          return (
            <div
              key={tier.id}
              className={`ww-tier-card ${isCurrent ? 'ww-tier-current' : ''} ${tier.isDefault ? 'ww-tier-default' : ''}`}
            >
              {isCurrent && <div className="ww-tier-current-badge">Current Plan</div>}
              <div className="ww-tier-header">
                {tier.iconClass && <span className={`ww-tier-icon ${tier.iconClass}`} />}
                <h3>{tier.name}</h3>
                <div className="ww-tier-price">
                  {tier.isFreeTier && !pricing ? (
                    <span className="ww-tier-price-amount">Free</span>
                  ) : pricing ? (
                    <>
                      <span className="ww-tier-price-amount">{formatPrice(pricing.price, currency)}</span>
                      <span className="ww-tier-price-interval">
                        /{pricing.billingFrequency?.toLowerCase() ?? 'month'}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
              {tier.description && <p className="ww-tier-description">{tier.description}</p>}
              {tier.features?.length > 0 && (
                <ul className="ww-tier-features">
                  {tier.features.map((f) => (
                    <li key={f.id} className={`ww-tier-feature-item ${f.isEnabled ? '' : 'ww-tier-feature-disabled'}`}>
                      <span className={f.isEnabled ? 'ww-icon-check' : 'ww-icon-x'} />
                      {f.displayName}
                    </li>
                  ))}
                </ul>
              )}
              {tier.limits?.length > 0 && (
                <div className="ww-tier-limits">
                  {tier.limits.map((l) => (
                    <div key={l.id} className="ww-tier-limit-item">
                      <span className="ww-tier-limit-value">
                        {l.maxValue === -1 ? 'Unlimited' : l.maxValue.toLocaleString()}
                      </span>
                      <span className="ww-tier-limit-name">
                        {l.displayName}
                        {l.unit ? ` (${l.unit})` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="ww-tier-footer">
                {isCurrent ? (
                  <span className="ww-badge ww-badge-success">Current Plan</span>
                ) : (
                  <button
                    type="button"
                    className={`ww-btn ${tier.isDefault ? 'ww-btn-primary' : 'ww-btn-outline'} ww-btn-block`}
                    onClick={() => handleSelect(tier)}
                    disabled={processingTierId === tier.id}
                  >
                    {processingTierId === tier.id ? 'Processing...' : 'Select Plan'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
