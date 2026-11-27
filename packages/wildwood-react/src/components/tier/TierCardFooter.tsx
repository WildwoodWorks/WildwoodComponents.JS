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
  /**
   * The subscriber's current plan does not allow a move to this one (`isTierChangeAllowed`). The
   * footer then shows a marker instead of a switch button the server would only refuse.
   */
  unavailable?: boolean;
  /** The marker's text. Default "Not available on your plan". */
  unavailableText?: string;
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
  unavailable,
  unavailableText = 'Not available on your plan',
  onSelect,
}: TierCardFooterProps) {
  if (isCurrent) {
    return (
      <div className="ww-tier-footer">
        <span className="ww-btn ww-btn-success ww-btn-block">Current Plan</span>
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

  // A switch the current plan does not allow. A marker, not a disabled button: like "Current Plan" it
  // is not an action, so nothing (a screen reader, a test locating switch buttons) offers it as one.
  if (unavailable && tier.showSubscribeButton !== false) {
    return (
      <div className="ww-tier-footer">
        <span className="ww-btn ww-btn-outline ww-btn-block ww-tier-unavailable" aria-disabled="true">
          {unavailableText}
        </span>
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
            ? `Switch to ${tier.name}`
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
