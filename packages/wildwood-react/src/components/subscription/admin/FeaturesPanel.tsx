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
        <span className="ww-features-summary-icon" />
        <span>
          {enabledCount} of {features.length} features enabled
        </span>
      </div>

      {categories.map((category) => {
        const catFeatures = features.filter((f) => (f.category || '') === category);
        return (
          <div key={category || '_uncategorized'} className="ww-features-category-card">
            {category && (
              <div className="ww-features-category-header">
                <span className="ww-features-category-icon" />
                <h5 className="ww-features-category-name">{category}</h5>
              </div>
            )}
            <div className="ww-features-card-list">
              {catFeatures.map((f) => (
                <div
                  key={f.featureCode}
                  className={`ww-feature-card ${f.isEnabled ? 'ww-feature-card-enabled' : 'ww-feature-card-locked'}`}
                >
                  <div
                    className={`ww-feature-card-icon ${f.isEnabled ? 'ww-feature-card-icon-enabled' : 'ww-feature-card-icon-locked'}`}
                  >
                    <span className={f.isEnabled ? 'ww-icon-check' : 'ww-icon-lock'} />
                  </div>
                  <div className="ww-feature-card-body">
                    <span className="ww-feature-card-name">{f.displayName}</span>
                    {f.description && <span className="ww-feature-card-desc">{f.description}</span>}
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
