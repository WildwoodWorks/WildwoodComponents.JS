'use client';

// The plan a signup link already chose, shown above the registration form.
//
// The visitor picked this on a pricing page, so the signup does not ask again — it shows what they
// are getting, at the price the catalog is quoting this minute, and offers a way back to the grid.
// Same markup as the wizard's summary card, so a site that styled it keeps its styling.

import type { AppTierModel, AppTierPricingModel } from '@wildwood/core';
import { formatMoney, trialLabel } from '@wildwood/core';
import type { RegistrationSubscriptionLabels } from '../labels.js';

export interface PlanSummaryCardProps {
  /** The chosen plan, from the live catalog. */
  tier: AppTierModel;
  /** The pricing option being bought, or null for a plan with no price at all. */
  pricing?: AppTierPricingModel | null;
  /** The currency the catalog is quoted in. */
  currency: string;
  labels: RegistrationSubscriptionLabels;
  /** Offers "Change plan". Omitted, the card is read-only (the plan is not the visitor's to change). */
  onChangePlan?: () => void;
}

export function PlanSummaryCard({ tier, pricing, currency, labels, onChangePlan }: PlanSummaryCardProps) {
  const trial = tier.isFreeTier ? '' : trialLabel(pricing?.trialDays);

  return (
    <div className="ww-plan-summary-card">
      <div className="ww-plan-summary-content">
        <div className="ww-plan-info">
          <h5 className="ww-plan-name">{tier.name}</h5>
          {tier.description ? <p className="ww-plan-desc">{tier.description}</p> : null}
        </div>
        <div className="ww-plan-price">
          {pricing ? (
            <>
              <span className="ww-price-amount">{formatMoney(pricing.price, currency)}</span>
              <span className="ww-price-period">/{(pricing.billingFrequency ?? '').toLowerCase()}</span>
              {trial ? <div className="ww-plan-trial">{trial}</div> : null}
            </>
          ) : (
            // Never a made-up number: a plan with no pricing option says what it is instead.
            <span className="ww-price-amount">{tier.isFreeTier ? labels.planFree : ''}</span>
          )}
        </div>
      </div>
      {onChangePlan ? (
        <button type="button" className="ww-plan-change-link" onClick={onChangePlan}>
          {labels.changePlan}
        </button>
      ) : null}
    </div>
  );
}
