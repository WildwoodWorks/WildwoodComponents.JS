// FeaturesPanel - ported from WildwoodComponents.Blazor Subscription/Admin/FeaturesPanel.razor

import type { AppFeatureDefinitionModel } from '@wildwood/core';

export interface FeaturesPanelProps {
  features: AppFeatureDefinitionModel[];
  loading?: boolean;
  className?: string;
}

export function FeaturesPanel({ features, loading, className }: FeaturesPanelProps) {
  if (loading) {
    return (
      <div className={`ww-features-panel ${className ?? ''}`}>
        <div className="ww-loading">
          <div className="ww-spinner" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!features.length) {
    return (
      <div className={`ww-features-panel ${className ?? ''}`}>
        <div className="ww-alert ww-alert-info">No features configured.</div>
      </div>
    );
  }

  const categories = [...new Set(features.map((f) => f.category).filter(Boolean))];
  if (categories.length === 0) categories.push('');

  const enabledCount = features.filter((f) => f.isEnabled).length;

  return (
    <div className={`ww-features-panel ${className ?? ''}`}>
      <div className="ww-features-summary">
        <span className="ww-text-muted">
          {enabledCount} of {features.length} features enabled
        </span>
      </div>

      {categories.map((category) => {
        const catFeatures = features.filter((f) => (f.category || '') === category);
        return (
          <div key={category || '_uncategorized'} className="ww-features-category">
            {category && <h5 className="ww-features-category-name">{category}</h5>}
            <div className="ww-features-list">
              {catFeatures.map((f) => (
                <div
                  key={f.featureCode}
                  className={`ww-feature-item ${f.isEnabled ? 'ww-feature-enabled' : 'ww-feature-locked'}`}
                >
                  <span className={f.isEnabled ? 'ww-icon-check ww-text-success' : 'ww-icon-lock ww-text-muted'} />
                  <div className="ww-feature-info">
                    <span className={`ww-feature-name ${!f.isEnabled ? 'ww-text-muted' : ''}`}>{f.displayName}</span>
                    {f.description && (
                      <span className="ww-feature-description ww-text-muted ww-text-sm">{f.description}</span>
                    )}
                  </div>
                  <span className={`ww-badge ${f.isEnabled ? 'ww-badge-success' : 'ww-badge-secondary'}`}>
                    {f.isEnabled ? 'Enabled' : 'Locked'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
