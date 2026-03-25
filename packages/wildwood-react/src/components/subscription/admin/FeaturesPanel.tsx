// FeaturesPanel - ported from WildwoodComponents.Blazor Subscription/Admin/FeaturesPanel.razor

import { useState, useCallback } from 'react';
import type { AppFeatureDefinitionModel, AppFeatureOverrideModel } from '@wildwood/core';

export interface FeaturesPanelProps {
  features: AppFeatureDefinitionModel[];
  featureOverrides?: AppFeatureOverrideModel[];
  isAdmin?: boolean;
  loading?: boolean;
  className?: string;
  onToggleFeature?: (featureCode: string, isEnabled: boolean, reason?: string, expiresAt?: string) => Promise<void>;
  onOverrideRemoved?: () => void;
}

function parseExpiration(value: string): string | undefined {
  if (!value) return undefined;
  const now = new Date();
  switch (value) {
    case '1h':
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    case '1d':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    case '7d':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    case '30d':
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    default:
      return undefined;
  }
}

export function FeaturesPanel({
  features,
  featureOverrides = [],
  isAdmin = false,
  loading,
  className,
  onToggleFeature,
}: FeaturesPanelProps) {
  const [confirmingFeature, setConfirmingFeature] = useState<string | null>(null);
  const [confirmExpiration, setConfirmExpiration] = useState('');
  const [confirmReason, setConfirmReason] = useState('');
  const [processingFeature, setProcessingFeature] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const hasOverride = useCallback(
    (featureCode: string) => featureOverrides.some((o) => o.featureCode === featureCode),
    [featureOverrides],
  );

  const getOverrideTooltip = useCallback(
    (featureCode: string) => {
      const ov = featureOverrides.find((o) => o.featureCode === featureCode);
      if (!ov) return '';
      const parts = [`Override: ${ov.isEnabled ? 'Enabled' : 'Disabled'}`];
      if (ov.reason) parts.push(`Reason: ${ov.reason}`);
      if (ov.expiresAt) parts.push(`Expires: ${new Date(ov.expiresAt).toLocaleString()}`);
      return parts.join(' | ');
    },
    [featureOverrides],
  );

  const handleRequestToggle = useCallback((featureCode: string) => {
    setConfirmingFeature(featureCode);
    setConfirmExpiration('');
    setConfirmReason('');
    setInlineError(null);
  }, []);

  const handleCancelToggle = useCallback(() => {
    setConfirmingFeature(null);
    setConfirmExpiration('');
    setConfirmReason('');
    setInlineError(null);
  }, []);

  const handleConfirmToggle = useCallback(
    async (feature: AppFeatureDefinitionModel) => {
      if (!onToggleFeature || processingFeature) return;
      setProcessingFeature(feature.featureCode);
      setInlineError(null);
      try {
        const expiresAt = parseExpiration(confirmExpiration);
        await onToggleFeature(feature.featureCode, !feature.isEnabled, confirmReason || undefined, expiresAt);
        setConfirmingFeature(null);
        setConfirmExpiration('');
        setConfirmReason('');
      } catch (err) {
        setInlineError(err instanceof Error ? err.message : 'Failed to toggle feature');
      } finally {
        setProcessingFeature(null);
      }
    },
    [onToggleFeature, processingFeature, confirmExpiration, confirmReason],
  );

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
      {inlineError && (
        <div className="ww-alert ww-alert-danger">
          {inlineError}
          <button type="button" className="ww-alert-dismiss" onClick={() => setInlineError(null)}>
            &times;
          </button>
        </div>
      )}

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
                <div key={f.featureCode}>
                  <div
                    className={`ww-feature-card ${f.isEnabled ? 'ww-feature-card-enabled' : 'ww-feature-card-locked'}`}
                  >
                    <div
                      className={`ww-feature-card-icon ${f.isEnabled ? 'ww-feature-card-icon-enabled' : 'ww-feature-card-icon-locked'}`}
                    >
                      <span className={f.isEnabled ? 'ww-icon-check' : 'ww-icon-lock'} />
                    </div>
                    <div className="ww-feature-card-body">
                      <span className="ww-feature-card-name">
                        {f.displayName}
                        {isAdmin && hasOverride(f.featureCode) && (
                          <span className="ww-feature-override-badge" title={getOverrideTooltip(f.featureCode)}>
                            &#x1f6e1;
                          </span>
                        )}
                      </span>
                      {f.description && <span className="ww-feature-card-desc">{f.description}</span>}
                    </div>
                    {isAdmin && onToggleFeature ? (
                      processingFeature === f.featureCode ? (
                        <div className="ww-spinner ww-spinner-sm" />
                      ) : confirmingFeature === f.featureCode ? (
                        <span className="ww-feature-confirming-label">&#x2193;</span>
                      ) : (
                        <button
                          type="button"
                          className={`ww-feature-toggle-btn ${f.isEnabled ? 'ww-feature-toggle-on' : 'ww-feature-toggle-off'}`}
                          onClick={() => handleRequestToggle(f.featureCode)}
                          title={f.isEnabled ? 'Click to disable' : 'Click to enable'}
                        >
                          <span>{f.isEnabled ? 'Enabled' : 'Locked'}</span>
                        </button>
                      )
                    ) : (
                      <span className={`ww-badge ${f.isEnabled ? 'ww-badge-success' : 'ww-badge-secondary'}`}>
                        {f.isEnabled ? 'Enabled' : 'Locked'}
                      </span>
                    )}
                  </div>

                  {/* Confirmation row - rendered below the feature card */}
                  {isAdmin && confirmingFeature === f.featureCode && (
                    <div className="ww-feature-confirm-row">
                      <div className="ww-feature-confirm-message">
                        {f.isEnabled ? 'Disable' : 'Enable'} <strong>{f.displayName}</strong>?
                      </div>
                      <div className="ww-feature-confirm-options">
                        <select
                          className="ww-feature-confirm-select"
                          aria-label="Override expiration"
                          value={confirmExpiration}
                          onChange={(e) => setConfirmExpiration(e.target.value)}
                        >
                          <option value="">No expiration</option>
                          <option value="1h">Expires in 1 hour</option>
                          <option value="1d">Expires in 1 day</option>
                          <option value="7d">Expires in 7 days</option>
                          <option value="30d">Expires in 30 days</option>
                        </select>
                        <input
                          type="text"
                          className="ww-feature-confirm-reason"
                          placeholder="Reason (optional)"
                          value={confirmReason}
                          onChange={(e) => setConfirmReason(e.target.value)}
                        />
                      </div>
                      <div className="ww-feature-confirm-actions">
                        <button
                          type="button"
                          className="ww-feature-confirm-btn ww-feature-confirm-yes"
                          onClick={() => handleConfirmToggle(f)}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="ww-feature-confirm-btn ww-feature-confirm-no"
                          onClick={handleCancelToggle}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
