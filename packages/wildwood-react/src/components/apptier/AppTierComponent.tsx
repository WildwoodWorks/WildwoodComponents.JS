'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppTier } from '../../hooks/useAppTier.js';

export interface AppTierComponentProps {
  autoLoad?: boolean;
  onTierChanged?: (tierId: string) => void;
  className?: string;
}

export function AppTierComponent({ autoLoad = true, onTierChanged, className }: AppTierComponentProps) {
  const { tiers, userSubscription, loading, error, getTiers, getUserSubscription, changeTier } = useAppTier();
  const [changeError, setChangeError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (autoLoad) {
      getTiers();
      getUserSubscription();
    }
  }, [autoLoad, getTiers, getUserSubscription]);

  const handleChangeTier = useCallback(
    async (tierId: string) => {
      setChangeError(null);
      setSuccessMessage('');
      try {
        const result = await changeTier(tierId);
        if (result.success) {
          setSuccessMessage('Tier changed successfully');
          onTierChanged?.(tierId);
        } else {
          setChangeError(result.errorMessage ?? 'Tier change failed');
        }
      } catch (err) {
        setChangeError(err instanceof Error ? err.message : 'Tier change failed');
      }
    },
    [changeTier, onTierChanged],
  );

  return (
    <div className={`ww-apptier-component ${className ?? ''}`}>
      {error && <div className="ww-alert ww-alert-danger">{error}</div>}
      {changeError && <div className="ww-alert ww-alert-danger">{changeError}</div>}
      {successMessage && <div className="ww-alert ww-alert-success">{successMessage}</div>}

      {userSubscription && (
        <div className="ww-current-tier">
          <h4>Current Tier</h4>
          <div className="ww-tier-badge">
            <strong>{userSubscription.tierName}</strong>
            {userSubscription.endDate && (
              <span className="ww-text-muted"> Expires: {new Date(userSubscription.endDate).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="ww-loading">Loading tiers...</div>
      ) : (
        <div className="ww-tier-grid">
          {tiers.map((tier) => {
            const isCurrent = userSubscription?.appTierId === tier.id;
            const defaultPricing = tier.pricingOptions?.find((p) => p.isDefault) ?? tier.pricingOptions?.[0];
            return (
              <div key={tier.id} className={`ww-tier-card ${isCurrent ? 'ww-tier-current' : ''}`}>
                <div className="ww-tier-header">
                  <h3>{tier.name}</h3>
                  {defaultPricing && (
                    <div className="ww-tier-price">
                      ${defaultPricing.price}
                      {defaultPricing.billingFrequency && <span>/{defaultPricing.billingFrequency}</span>}
                    </div>
                  )}
                  {tier.isFreeTier && !defaultPricing && <div className="ww-tier-price">Free</div>}
                </div>
                {tier.description && <p className="ww-tier-description">{tier.description}</p>}
                {tier.features && tier.features.length > 0 && (
                  <ul className="ww-tier-features">
                    {tier.features.map((f) => (
                      <li key={f.id}>{f.displayName}</li>
                    ))}
                  </ul>
                )}
                <div className="ww-tier-footer">
                  {isCurrent ? (
                    <span className="ww-badge ww-badge-success">Current Plan</span>
                  ) : (
                    <button
                      type="button"
                      className="ww-btn ww-btn-primary"
                      onClick={() => handleChangeTier(tier.id)}
                      disabled={loading}
                    >
                      {loading ? 'Changing...' : 'Select Plan'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
