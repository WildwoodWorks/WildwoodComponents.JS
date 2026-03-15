import { useState, useEffect, useCallback } from 'react';
import type { AppTierModel, AppTierPricingModel } from '@wildwood/core';
import { useWildwood } from '../../hooks/useWildwood.js';
import { TierCard } from '../tier/TierCard.js';
import { getSelectedPricing, computeAnnualDiscount, hasAnnualPricing } from '../tier/tierUtils.js';

export interface PricingDisplayComponentProps {
  appId?: string;
  title?: string;
  subtitle?: string;
  showBillingToggle?: boolean;
  showFeatureComparison?: boolean;
  showLimits?: boolean;
  currency?: string;
  enterpriseContactUrl?: string;
  /** Tier ID to visually highlight (e.g. from a pricing page selection). */
  preSelectedTierId?: string;
  onSelectTier?: (tier: AppTierModel, pricing: AppTierPricingModel | null) => void;
  preloadedTiers?: AppTierModel[];
  className?: string;
}

export function PricingDisplayComponent({
  appId,
  title,
  subtitle,
  showBillingToggle = true,
  showFeatureComparison = true,
  showLimits = true,
  currency = 'USD',
  enterpriseContactUrl,
  preSelectedTierId,
  onSelectTier,
  preloadedTiers,
  className,
}: PricingDisplayComponentProps) {
  const client = useWildwood();
  const resolvedAppId = appId ?? client.config.appId ?? '';

  const [tiers, setTiers] = useState<AppTierModel[]>(preloadedTiers ?? []);
  const [loading, setLoading] = useState(!preloadedTiers);
  const [error, setError] = useState<string | null>(null);
  const [billingAnnual, setBillingAnnual] = useState(false);

  useEffect(() => {
    if (preloadedTiers) {
      setTiers(preloadedTiers);
      setLoading(false);
      return;
    }

    if (!resolvedAppId) {
      setError('No appId provided');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    client.appTier
      .getPublicTiers(resolvedAppId)
      .then((result) => {
        setTiers(result);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load pricing');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [resolvedAppId, preloadedTiers, client.appTier]);

  const handleSelect = useCallback(
    (tier: AppTierModel) => {
      const pricing = getSelectedPricing(tier, billingAnnual) ?? null;
      onSelectTier?.(tier, pricing);
    },
    [billingAnnual, onSelectTier],
  );

  return (
    <div className={`ww-apptier-component ww-pricing-display ${className ?? ''}`}>
      {/* Header */}
      {(title || subtitle) && (
        <div className="ww-apptier-header-section">
          {title && <h2 className="ww-apptier-title">{title}</h2>}
          {subtitle && <p className="ww-apptier-subtitle">{subtitle}</p>}
        </div>
      )}

      {error && <div className="ww-alert ww-alert-danger">{error}</div>}

      {/* Billing Toggle */}
      {showBillingToggle && hasAnnualPricing(tiers) && (
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
          <span className={billingAnnual ? 'ww-billing-active' : ''}>
            Annual
            {(() => {
              const maxDiscount = tiers.reduce((max, t) => {
                const d = computeAnnualDiscount(t);
                return d && d > max ? d : max;
              }, 0);
              return maxDiscount > 0 ? (
                <span className="ww-badge ww-badge-success ww-badge-sm">Save up to {maxDiscount}%</span>
              ) : null;
            })()}
          </span>
        </div>
      )}

      {/* Tiers Grid */}
      {loading ? (
        <div className="ww-apptier-loading">
          <div className="ww-spinner" />
          <span>Loading plans...</span>
        </div>
      ) : (
        <div className="ww-tier-grid">
          {tiers.map((tier) => {
            const pricing = getSelectedPricing(tier, billingAnnual);
            const discount = billingAnnual ? computeAnnualDiscount(tier) : null;
            const isPreSelected = preSelectedTierId === tier.id;

            return (
              <TierCard
                key={tier.id}
                tier={tier}
                pricing={pricing}
                currency={currency}
                discount={discount}
                isPreSelected={isPreSelected}
                showFeatures={showFeatureComparison}
                showLimits={showLimits}
                enterpriseContactUrl={enterpriseContactUrl}
                onSelect={handleSelect}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
