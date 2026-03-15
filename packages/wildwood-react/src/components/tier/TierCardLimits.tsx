import type { AppTierLimitModel } from '@wildwood/core';

export interface TierCardLimitsProps {
  limits: AppTierLimitModel[];
}

export function TierCardLimits({ limits }: TierCardLimitsProps) {
  if (!limits || limits.length === 0) return null;

  return (
    <div className="ww-tier-limits">
      {limits.map((l) => (
        <div key={l.id} className="ww-tier-limit-item">
          <span className="ww-tier-limit-value">{l.maxValue === -1 ? 'Unlimited' : l.maxValue.toLocaleString()}</span>
          <span className="ww-tier-limit-name">
            {l.displayName}
            {l.unit ? ` (${l.unit})` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}
