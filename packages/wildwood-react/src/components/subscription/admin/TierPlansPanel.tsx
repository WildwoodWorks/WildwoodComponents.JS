// TierPlansPanel - ported from WildwoodComponents.Blazor Subscription/Admin/TierPlansPanel.razor

import { useState, useCallback } from 'react';
import type { AppTierModel } from '@wildwood/core';
import { TierCard } from '../../tier/TierCard.js';
import { getSelectedPricing, hasAnnualPricing } from '../../tier/tierUtils.js';

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
  enterpriseContactUrl?: string;
  onTierSelected?: (args: TierSelectedEventArgs) => void;
  className?: string;
}

export function TierPlansPanel({
  tiers,
  currentTierId,
  loading,
  showBillingToggle = true,
  currency = 'USD',
  enterpriseContactUrl,
  onTierSelected,
  className,
}: TierPlansPanelProps) {
  const [billingAnnual, setBillingAnnual] = useState(false);
  const [processingTierId, setProcessingTierId] = useState<string | null>(null);

  const hasAnnual = hasAnnualPricing(tiers);

  const handleSelect = useCallback(
    async (tier: AppTierModel) => {
      const pricing = getSelectedPricing(tier, billingAnnual);
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
    [billingAnnual, currentTierId, onTierSelected],
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
          const pricing = getSelectedPricing(tier, billingAnnual);

          return (
            <TierCard
              key={tier.id}
              tier={tier}
              pricing={pricing}
              currency={currency}
              isCurrent={isCurrent}
              enterpriseContactUrl={enterpriseContactUrl}
              disabled={processingTierId === tier.id}
              processingText={processingTierId === tier.id ? 'Processing...' : undefined}
              onSelect={handleSelect}
            />
          );
        })}
      </div>
    </div>
  );
}
