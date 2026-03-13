import { useState, useEffect, useCallback } from 'react';
import type { AppTierModel, AppTierPricingModel } from '@wildwood/core';
import { useWildwood } from '../../hooks/useWildwood.js';

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

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '\u20AC',
  GBP: '\u00A3',
  JPY: '\u00A5',
  INR: '\u20B9',
};

function formatPrice(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '$';
  return currency === 'JPY' ? `${symbol}${Math.round(amount)}` : `${symbol}${amount.toFixed(2)}`;
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

  const getPricing = useCallback(
    (tier: AppTierModel): AppTierPricingModel | undefined => {
      if (!tier.pricingOptions || tier.pricingOptions.length === 0) return undefined;
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

  const getAnnualDiscount = useCallback((tier: AppTierModel): number | null => {
    if (!tier.pricingOptions || tier.pricingOptions.length < 2) return null;
    const monthly = tier.pricingOptions.find((p) => p.billingFrequency?.toLowerCase() === 'monthly');
    const annual = tier.pricingOptions.find(
      (p) => p.billingFrequency?.toLowerCase() === 'yearly' || p.billingFrequency?.toLowerCase() === 'annual',
    );
    if (!monthly || !annual) return null;
    const monthlyTotal = monthly.price * 12;
    if (annual.price < monthlyTotal) {
      return Math.round(((monthlyTotal - annual.price) / monthlyTotal) * 100);
    }
    return null;
  }, []);

  const handleSelect = useCallback(
    (tier: AppTierModel) => {
      const pricing = getPricing(tier) ?? null;
      onSelectTier?.(tier, pricing);
    },
    [getPricing, onSelectTier],
  );

  // Determine if a tier looks like an enterprise tier (no pricing, not free)
  const isEnterpriseTier = (tier: AppTierModel): boolean => {
    return !tier.isFreeTier && (!tier.pricingOptions || tier.pricingOptions.length === 0);
  };

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
      {showBillingToggle &&
        tiers.some((t) =>
          t.pricingOptions?.some(
            (p) => p.billingFrequency?.toLowerCase() === 'yearly' || p.billingFrequency?.toLowerCase() === 'annual',
          ),
        ) && (
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
                  const d = getAnnualDiscount(t);
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
            const pricing = getPricing(tier);
            const discount = billingAnnual ? getAnnualDiscount(tier) : null;
            const enterprise = isEnterpriseTier(tier);
            const isPreSelected = preSelectedTierId === tier.id;

            return (
              <div
                key={tier.id}
                className={`ww-tier-card ${isPreSelected ? 'ww-tier-preselected' : ''} ${tier.isDefault && !isPreSelected ? 'ww-tier-default' : ''}`}
              >
                {isPreSelected && <div className="ww-tier-preselected-badge">Your Selection</div>}
                {tier.isDefault && !isPreSelected && <div className="ww-tier-default-badge">Popular</div>}
                <div className="ww-tier-header">
                  {tier.iconClass && <span className={`ww-tier-icon ${tier.iconClass}`} />}
                  <h3>{tier.name}</h3>
                  {tier.badgeColor && <span className={`ww-badge ww-badge-${tier.badgeColor}`}>{tier.status}</span>}
                  <div className="ww-tier-price">
                    {enterprise ? (
                      <span className="ww-tier-price-amount">Custom</span>
                    ) : tier.isFreeTier && !pricing ? (
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
                  {discount && <div className="ww-tier-discount">Save {discount}%</div>}
                </div>

                {tier.description && <p className="ww-tier-description">{tier.description}</p>}

                {/* Features */}
                {showFeatureComparison && tier.features && tier.features.length > 0 && (
                  <ul className="ww-tier-features">
                    {tier.features.map((f) => (
                      <li
                        key={f.id}
                        className={`ww-tier-feature-item ${f.isEnabled ? '' : 'ww-tier-feature-disabled'}`}
                      >
                        {f.isEnabled ? (
                          <svg
                            className="ww-tier-feature-check"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <svg
                            className="ww-tier-feature-x"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        )}
                        <span>{f.displayName}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Limits */}
                {showLimits && tier.limits && tier.limits.length > 0 && (
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
                  {enterprise && enterpriseContactUrl ? (
                    <a
                      href={enterpriseContactUrl}
                      className="ww-btn ww-btn-outline ww-btn-block"
                      {...(enterpriseContactUrl.startsWith('http')
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                    >
                      Contact Sales
                    </a>
                  ) : enterprise ? (
                    <button
                      type="button"
                      className="ww-btn ww-btn-outline ww-btn-block"
                      onClick={() => handleSelect(tier)}
                    >
                      Contact Sales
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`ww-btn ${isPreSelected || tier.isDefault ? 'ww-btn-primary' : 'ww-btn-outline'} ww-btn-block`}
                      onClick={() => handleSelect(tier)}
                    >
                      {isPreSelected ? 'Continue with This Plan' : tier.isFreeTier ? 'Get Started' : 'Subscribe'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
