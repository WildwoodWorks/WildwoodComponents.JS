import type { AppTierModel, AppTierPricingModel } from '@wildwood/core';
import { isEnterpriseTier } from './tierUtils.js';
import { TierCardHeader } from './TierCardHeader.js';
import { TierCardFeatures } from './TierCardFeatures.js';
import { TierCardLimits } from './TierCardLimits.js';
import { TierCardFooter } from './TierCardFooter.js';

export interface TierCardProps {
  tier: AppTierModel;
  pricing?: AppTierPricingModel;
  currency?: string;
  discount?: number | null;
  isCurrent?: boolean;
  isPreSelected?: boolean;
  hasSubscription?: boolean;
  showFeatures?: boolean;
  showLimits?: boolean;
  enterpriseContactUrl?: string;
  disabled?: boolean;
  processingText?: string;
  onSelect?: (tier: AppTierModel) => void;
}

export function TierCard({
  tier,
  pricing,
  currency = 'USD',
  discount,
  isCurrent,
  isPreSelected,
  hasSubscription,
  showFeatures = true,
  showLimits = true,
  enterpriseContactUrl,
  disabled,
  processingText,
  onSelect,
}: TierCardProps) {
  const enterprise = isEnterpriseTier(tier);

  const cardClasses = [
    'ww-tier-card',
    isCurrent ? 'ww-tier-current' : '',
    isPreSelected ? 'ww-tier-preselected' : '',
    tier.isDefault && !isPreSelected && !isCurrent ? 'ww-tier-default' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cardClasses}>
      {isCurrent ? null : tier.customBadgeText ? (
        <div className="ww-tier-default-badge">{tier.customBadgeText}</div>
      ) : isPreSelected ? (
        <div className="ww-tier-preselected-badge">Your Selection</div>
      ) : null}

      <TierCardHeader
        name={tier.name}
        iconClass={tier.iconClass}
        badgeColor={tier.badgeColor}
        status={tier.status}
        showPrice={tier.showPrice !== false}
        isEnterprise={enterprise}
        isFreeTier={tier.isFreeTier}
        pricing={pricing}
        discount={discount}
        currency={currency}
      />

      {tier.description && <p className="ww-tier-description">{tier.description}</p>}

      {showFeatures && <TierCardFeatures features={tier.features} />}
      {showLimits && <TierCardLimits limits={tier.limits} />}

      <TierCardFooter
        tier={tier}
        isEnterprise={enterprise}
        isCurrent={isCurrent}
        isPreSelected={isPreSelected}
        hasSubscription={hasSubscription}
        enterpriseContactUrl={enterpriseContactUrl}
        disabled={disabled}
        processingText={processingText}
        onSelect={onSelect}
      />
    </div>
  );
}
