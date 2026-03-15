import type { AppTierFeatureModel } from '@wildwood/core';

export interface TierCardFeaturesProps {
  features: AppTierFeatureModel[];
}

export function TierCardFeatures({ features }: TierCardFeaturesProps) {
  if (!features || features.length === 0) return null;

  return (
    <ul className="ww-tier-features">
      {features.map((f) => (
        <li key={f.id} className={`ww-tier-feature-item ${f.isEnabled ? '' : 'ww-tier-feature-disabled'}`}>
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
  );
}
