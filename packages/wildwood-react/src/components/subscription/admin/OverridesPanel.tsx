// OverridesPanel - ported from WildwoodComponents.Blazor Subscription/Admin/OverridesPanel.razor

import { useState, useCallback } from 'react';
import type { AppFeatureOverrideModel } from '@wildwood/core';

export interface OverridesPanelProps {
  overrides: AppFeatureOverrideModel[];
  loading?: boolean;
  className?: string;
  onRemoveOverride?: (featureCode: string) => Promise<void>;
  onMakePermanent?: (override: AppFeatureOverrideModel) => Promise<void>;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function OverridesPanel({
  overrides,
  loading,
  className,
  onRemoveOverride,
  onMakePermanent,
}: OverridesPanelProps) {
  const [processingFeatureCode, setProcessingFeatureCode] = useState<string | null>(null);

  const handleRemove = useCallback(
    async (ov: AppFeatureOverrideModel) => {
      if (!onRemoveOverride || processingFeatureCode) return;
      setProcessingFeatureCode(ov.featureCode);
      try {
        await onRemoveOverride(ov.featureCode);
      } finally {
        setProcessingFeatureCode(null);
      }
    },
    [onRemoveOverride, processingFeatureCode],
  );

  const handleMakePermanent = useCallback(
    async (ov: AppFeatureOverrideModel) => {
      if (!onMakePermanent || processingFeatureCode) return;
      setProcessingFeatureCode(ov.featureCode);
      try {
        await onMakePermanent(ov);
      } finally {
        setProcessingFeatureCode(null);
      }
    },
    [onMakePermanent, processingFeatureCode],
  );

  if (loading) {
    return (
      <div className={`ww-overrides-panel ${className ?? ''}`}>
        <div className="ww-loading">
          <div className="ww-spinner" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!overrides.length) {
    return <div className={`ww-overrides-empty ${className ?? ''}`}>No active feature overrides.</div>;
  }

  return (
    <div className={`ww-overrides-panel ${className ?? ''}`}>
      <div className="ww-overrides-header">
        <span className="ww-overrides-count">
          {overrides.length} active {overrides.length === 1 ? 'override' : 'overrides'}
        </span>
      </div>

      <div className="ww-overrides-table-wrapper">
        <table className="ww-overrides-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Expires</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {overrides.map((ov) => {
              const isProcessing = processingFeatureCode === ov.featureCode;
              return (
                <tr key={ov.featureCode} className={isProcessing ? 'ww-override-removing' : ''}>
                  <td className="ww-override-feature">
                    <code>{ov.featureCode}</code>
                  </td>
                  <td>
                    <span
                      className={`ww-override-status ${ov.isEnabled ? 'ww-override-enabled' : 'ww-override-disabled'}`}
                    >
                      {ov.isEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="ww-override-reason">{ov.reason || <span className="ww-override-none">-</span>}</td>
                  <td className="ww-override-expires">
                    {ov.expiresAt ? formatDate(ov.expiresAt) : <span className="ww-override-none">Never</span>}
                  </td>
                  <td className="ww-override-created">{formatDate(ov.createdAt)}</td>
                  <td className="ww-override-actions">
                    {isProcessing ? (
                      <div className="ww-spinner ww-spinner-sm" />
                    ) : (
                      <>
                        {ov.expiresAt && onMakePermanent && (
                          <button
                            type="button"
                            className="ww-override-permanent-btn"
                            title="Make permanent (remove expiration)"
                            onClick={() => handleMakePermanent(ov)}
                          >
                            &#x221e;
                          </button>
                        )}
                        {onRemoveOverride && (
                          <button
                            type="button"
                            className="ww-override-remove-btn"
                            title="Remove override (revert to tier-based)"
                            onClick={() => handleRemove(ov)}
                          >
                            &#x2717;
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
