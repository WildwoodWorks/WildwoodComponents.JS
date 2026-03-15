import type { AppTierPricingModel } from '@wildwood/core';
import { formatPrice } from './tierUtils.js';

export interface TierCardHeaderProps {
  name: string;
  iconClass?: string;
  badgeColor?: string;
  status?: string;
  showPrice?: boolean;
  isEnterprise: boolean;
  isFreeTier: boolean;
  pricing?: AppTierPricingModel;
  discount?: number | null;
  currency: string;
}

export function TierCardHeader({
  name,
  iconClass,
  badgeColor,
  status,
  showPrice = true,
  isEnterprise,
  isFreeTier,
  pricing,
  discount,
  currency,
}: TierCardHeaderProps) {
  return (
    <div className="ww-tier-header">
      {iconClass && <span className={`ww-tier-icon ${iconClass}`} />}
      <h3>{name}</h3>
      {badgeColor && <span className={`ww-badge ww-badge-${badgeColor}`}>{status}</span>}
      {showPrice && (
        <div className="ww-tier-price">
          {isEnterprise ? (
            <span className="ww-tier-price-amount">Custom</span>
          ) : isFreeTier && !pricing ? (
            <span className="ww-tier-price-amount">Free</span>
          ) : pricing ? (
            <>
              <span className="ww-tier-price-amount">{formatPrice(pricing.price, currency)}</span>
              <span className="ww-tier-price-interval">/{pricing.billingFrequency?.toLowerCase() ?? 'month'}</span>
            </>
          ) : null}
        </div>
      )}
      {discount ? <div className="ww-tier-discount">Save {discount}%</div> : null}
    </div>
  );
}
