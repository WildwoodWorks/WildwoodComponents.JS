'use client';

// The plan grid: the monthly/annual toggle over a row of `TierCard`s.
//
// Deliberately the same markup `PricingDisplayComponent` renders — `.ww-tier-grid` full of
// `.ww-tier-card`, the same toggle, the same `TierCard` footer CTAs ("Get Started", "Subscribe",
// "Switch to <Tier>") — because live sites' end-to-end suites locate plans by exactly those. This
// grid adds only what the component needs on top: the plans come from the public catalog, and the
// billing cycle is owned by the pricing view so a pack selection can be stamped with it too.

import type { AppTierModel } from '@wildwood/core';
import { TierCard } from '../../tier/TierCard.js';
import { getSelectedPricing, computeAnnualDiscount, hasAnnualPricing } from '../../tier/tierUtils.js';
import { formatLabel, type RegistrationSubscriptionLabels } from '../labels.js';
import type { PricingBilling } from '../types.js';

export interface PlanGridProps {
  /** Active plans in catalog order. Already filtered — this grid renders what it is given. */
  tiers: AppTierModel[];
  /** The currency every price in the grid is quoted in. */
  currency: string;
  billing: PricingBilling;
  onBillingChange: (billing: PricingBilling) => void;
  showBillingToggle?: boolean;
  showFeatures?: boolean;
  showLimits?: boolean;
  /** Marks one plan as already chosen. */
  highlightTierId?: string;
  /** Where an enterprise plan's "Contact Sales" link points. */
  contactUrl?: string;
  labels: RegistrationSubscriptionLabels;
  onSelectTier: (tier: AppTierModel) => void;
}

/** The largest annual saving on offer, or 0 when no plan is cheaper by the year. */
function bestAnnualDiscount(tiers: AppTierModel[]): number {
  return tiers.reduce((best, tier) => {
    const discount = computeAnnualDiscount(tier);
    return discount && discount > best ? discount : best;
  }, 0);
}

export function PlanGrid({
  tiers,
  currency,
  billing,
  onBillingChange,
  showBillingToggle = true,
  showFeatures = true,
  showLimits = true,
  highlightTierId,
  contactUrl,
  labels,
  onSelectTier,
}: PlanGridProps) {
  const annual = billing === 'annual';
  // A toggle with nothing to switch to is a control that lies, so it only appears once some plan
  // is actually priced by the year.
  const withToggle = showBillingToggle && hasAnnualPricing(tiers);
  const maxDiscount = withToggle ? bestAnnualDiscount(tiers) : 0;

  return (
    <div className="ww-regsub-plans">
      {withToggle && (
        <div className="ww-apptier-billing-toggle">
          <span className={annual ? '' : 'ww-billing-active'}>{labels.billingMonthly}</span>
          <button
            type="button"
            className={`ww-toggle ${annual ? 'ww-toggle-on' : ''}`}
            onClick={() => onBillingChange(annual ? 'monthly' : 'annual')}
            aria-label={labels.billingToggleAriaLabel}
            aria-pressed={annual}
          >
            <span className="ww-toggle-slider" />
          </button>
          <span className={annual ? 'ww-billing-active' : ''}>
            {labels.billingAnnual}
            {maxDiscount > 0 && (
              <span className="ww-badge ww-badge-success ww-badge-sm">
                {formatLabel(labels.annualSavings, { percent: maxDiscount })}
              </span>
            )}
          </span>
        </div>
      )}

      <div className="ww-tier-grid">
        {tiers.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            pricing={getSelectedPricing(tier, annual)}
            currency={currency}
            discount={annual ? computeAnnualDiscount(tier) : null}
            isPreSelected={Boolean(highlightTierId) && highlightTierId?.toLowerCase() === tier.id?.toLowerCase()}
            showFeatures={showFeatures}
            showLimits={showLimits}
            enterpriseContactUrl={contactUrl}
            onSelect={onSelectTier}
          />
        ))}
      </div>
    </div>
  );
}
