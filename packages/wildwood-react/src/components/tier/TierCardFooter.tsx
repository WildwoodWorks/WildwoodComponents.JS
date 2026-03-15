import type { AppTierModel } from '@wildwood/core';

export interface TierCardFooterProps {
  tier: AppTierModel;
  isEnterprise: boolean;
  isCurrent?: boolean;
  isPreSelected?: boolean;
  hasSubscription?: boolean;
  enterpriseContactUrl?: string;
  disabled?: boolean;
  processingText?: string;
  onSelect?: (tier: AppTierModel) => void;
}

export function TierCardFooter({
  tier,
  isEnterprise,
  isCurrent,
  isPreSelected,
  hasSubscription,
  enterpriseContactUrl,
  disabled,
  processingText,
  onSelect,
}: TierCardFooterProps) {
  if (isCurrent) {
    return (
      <div className="ww-tier-footer">
        <span className="ww-badge ww-badge-success">Current Plan</span>
      </div>
    );
  }

  // Priority 1: Tier explicitly configured with contact button
  if (tier.showContactButton && tier.contactButtonUrl) {
    return (
      <div className="ww-tier-footer">
        <a
          href={tier.contactButtonUrl}
          className={`ww-btn ${tier.isDefault ? 'ww-btn-primary' : 'ww-btn-outline'} ww-btn-block`}
          {...(tier.contactButtonUrl.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          Contact Us
        </a>
      </div>
    );
  }

  // Priority 2: Enterprise tier with fallback contact URL prop
  if (isEnterprise && enterpriseContactUrl) {
    return (
      <div className="ww-tier-footer">
        <a
          href={enterpriseContactUrl}
          className="ww-btn ww-btn-outline ww-btn-block"
          {...(enterpriseContactUrl.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          Contact Sales
        </a>
      </div>
    );
  }

  // Priority 3: Enterprise tier without URL — still show "Contact Sales" as a button
  if (isEnterprise) {
    return (
      <div className="ww-tier-footer">
        <button
          type="button"
          className="ww-btn ww-btn-outline ww-btn-block"
          onClick={() => onSelect?.(tier)}
          disabled={disabled}
        >
          {processingText ?? 'Contact Sales'}
        </button>
      </div>
    );
  }

  // Priority 4: Normal subscribe/select button
  if (tier.showSubscribeButton !== false) {
    const buttonText = processingText
      ? processingText
      : isPreSelected
        ? 'Continue with This Plan'
        : tier.isFreeTier
          ? hasSubscription
            ? 'Get Started Free'
            : 'Get Started'
          : hasSubscription
            ? `Switch to ${tier.name}`
            : 'Subscribe';

    return (
      <div className="ww-tier-footer">
        <button
          type="button"
          className={`ww-btn ${isPreSelected || tier.isDefault ? 'ww-btn-primary' : 'ww-btn-outline'} ww-btn-block`}
          onClick={() => onSelect?.(tier)}
          disabled={disabled}
        >
          {buttonText}
        </button>
      </div>
    );
  }

  return <div className="ww-tier-footer" />;
}
