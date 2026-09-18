'use client';

// The pricing view: what the app sells, at the price the server is quoting right now.
//
// Three rules shape this file.
//
//  · Every price comes off the live public catalog. There is no fallback price, no remembered
//    price and no "from" price anywhere in this directory — a guard test greps for one. While the
//    catalog loads the visitor sees shapes; if it cannot be read they see "pricing is unavailable"
//    and a Retry, never a number the server did not just say.
//
//  · It is SSR-safe. Nothing touches window or document at module scope or during render, and an
//    `initialCatalog` built during a server render is handed straight to `usePublicCatalog`, which
//    seeds it into the shared cache and returns it synchronously — so a prerendered page hydrates
//    with its prices already on screen rather than flashing a skeleton.
//
//  · The plan grid is the platform's existing `TierCard` grid, markup and CTAs unchanged, because
//    the live sites' end-to-end suites locate plans by exactly those.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppTierAddOnModel, AppTierModel } from '@wildwood/core';
import { usePublicCatalog } from '@wildwood/react-shared';
import { useWildwood } from '../../../hooks/useWildwood.js';
import { getSelectedPricing } from '../../tier/tierUtils.js';
import { CatalogJsonLd } from '../parts/CatalogJsonLd.js';
import { PackGrid } from '../parts/PackGrid.js';
import { PlanGrid } from '../parts/PlanGrid.js';
import { PricingSkeleton } from '../parts/PricingSkeleton.js';
import { resolveLabels } from '../labels.js';
import type { PricingBilling, RegistrationSubscriptionPricingProps } from '../types.js';

/** The code `onError` reports when the catalog could not be read. */
const CATALOG_ERROR_CODE = 'catalog_unavailable';

export function RegistrationSubscriptionPricing({
  appId,
  currency,
  className,
  labels: labelOverrides,
  contactUrl,
  onError,
  showPlans = true,
  showAddOns = false,
  offerFreeTierChoice = true,
  packSelection = 'none',
  addOnGroups,
  describeAddOn,
  showBillingToggle = true,
  defaultBilling = 'monthly',
  showFeatureComparison = true,
  showLimits = true,
  highlightTierId,
  initialCatalog,
  loadingFallback,
  errorFallback,
  includeJsonLd,
  onSelect,
}: RegistrationSubscriptionPricingProps) {
  const client = useWildwood();
  const resolvedAppId = appId ?? client.config.appId ?? '';
  const labels = useMemo(() => resolveLabels(labelOverrides), [labelOverrides]);

  const { catalog, loading, error, refresh } = usePublicCatalog(resolvedAppId, { currency, initialCatalog });

  const [billing, setBilling] = useState<PricingBilling>(defaultBilling);
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);

  // One report per distinct failure: a Retry that fails again is news, a re-render is not.
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (!error) {
      reported.current = null;
      return;
    }
    if (reported.current === error) return;
    reported.current = error;
    onError?.({ code: CATALOG_ERROR_CODE, message: error });
  }, [error, onError]);

  // The server names the currency the catalog is quoted in; the prop is an override for the rare
  // host that knows better.
  const displayCurrency = currency ?? catalog?.currency ?? '';

  const tiers = useMemo(() => {
    const all = catalog?.tiers ?? [];
    return offerFreeTierChoice ? all : all.filter((tier) => !tier.isFreeTier);
  }, [catalog, offerFreeTierChoice]);

  // Kept in catalog order rather than click order, so a selection reads the same as the grid.
  const selectionInCatalogOrder = useCallback(
    (ids: ReadonlySet<string>) => (catalog?.addOns ?? []).filter((addOn) => ids.has(addOn.id)).map((a) => a.id),
    [catalog],
  );

  const togglePack = useCallback(
    (addOnId: string) => {
      setSelectedPackIds((current) => {
        const next = new Set(current);
        if (next.has(addOnId)) next.delete(addOnId);
        else next.add(addOnId);
        return selectionInCatalogOrder(next);
      });
    },
    [selectionInCatalogOrder],
  );

  const handleSelectTier = useCallback(
    (tier: AppTierModel) => {
      onSelect({
        tierId: tier.id,
        pricingId: getSelectedPricing(tier, billing === 'annual')?.id,
        billing,
        // A plan CTA carries whatever packs are ticked, so one click buys the whole basket.
        addOnIds: [...selectedPackIds],
      });
    },
    [billing, onSelect, selectedPackIds],
  );

  const handleChoosePack = useCallback(
    (addOn: AppTierAddOnModel) => {
      onSelect({ billing, addOnIds: [addOn.id] });
    },
    [billing, onSelect],
  );

  const handleContinueWithPacks = useCallback(() => {
    onSelect({ billing, addOnIds: [...selectedPackIds] });
  }, [billing, onSelect, selectedPackIds]);

  const rootClasses = ['ww-regsub', 'ww-regsub-pricing', className].filter(Boolean).join(' ');
  const jsonLdUrl = typeof includeJsonLd === 'object' ? includeJsonLd.url : undefined;

  let body;
  if (error || (!loading && !catalog)) {
    // Never a stale price and never an invented one: when the catalog cannot be read the prices go
    // away with it.
    body = errorFallback ?? (
      <div className="ww-regsub-unavailable ww-alert ww-alert-danger" role="alert">
        <span>{labels.pricingUnavailable}</span>
        <button type="button" className="ww-btn ww-btn-outline" onClick={() => void refresh()}>
          {labels.retry}
        </button>
      </div>
    );
  } else if (!catalog) {
    body = loadingFallback ?? <PricingSkeleton label={labels.loadingPlans} />;
  } else {
    body = (
      <>
        {showPlans && (
          <PlanGrid
            tiers={tiers}
            currency={displayCurrency}
            billing={billing}
            onBillingChange={setBilling}
            showBillingToggle={showBillingToggle}
            showFeatures={showFeatureComparison}
            showLimits={showLimits}
            highlightTierId={highlightTierId}
            contactUrl={contactUrl}
            labels={labels}
            onSelectTier={handleSelectTier}
          />
        )}

        {showAddOns && (
          <PackGrid
            addOns={catalog.addOns}
            currency={displayCurrency}
            groups={addOnGroups}
            describeAddOn={describeAddOn}
            selection={packSelection}
            selectedIds={selectedPackIds}
            onToggle={togglePack}
            onChoose={handleChoosePack}
            onContinue={handleContinueWithPacks}
            labels={labels}
          />
        )}

        {includeJsonLd ? <CatalogJsonLd catalog={catalog} url={jsonLdUrl} /> : null}
      </>
    );
  }

  return (
    <div className={rootClasses} data-ww-view="pricing">
      {body}
    </div>
  );
}
