// The pricing view: what the app sells, at the price the server is quoting right now.
//
// Two rules shape this file, and they are the same two the web view keeps.
//
//  · Every price comes off the live public catalog. There is no fallback price, no remembered price
//    and no "from" price anywhere in this directory - a guard test greps for one. While the catalog
//    loads the visitor sees shapes; if it cannot be read they see "pricing is unavailable" and a
//    Retry, never a number the server did not just say.
//
//  · The plan grid is this package's existing `TierCard`, footer CTAs unchanged, because that is
//    what the native test suites and the screens hosts already ship locate plans by.
//
// What the web view has and this one does not: an SSR `initialCatalog`, JSON-LD offers and a
// `className`. None of the three has a native meaning - there is no server render to seed from, no
// crawler to publish offers to, and no cascade to hang a class on.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { AppTierAddOnModel, AppTierModel } from '@wildwood/core';
import { resolveRegistrationSubscriptionLabels } from '@wildwood/react-shared';
import { useWildwood } from '../../../hooks/useWildwood';
import { usePublicCatalog } from '../../../hooks/usePublicCatalog';
import { PackGrid } from '../parts/PackGrid';
import { PlanGrid } from '../parts/PlanGrid';
import { PricingSkeleton } from '../parts/PricingSkeleton';
import { wwViewTestIds } from '../testIds';
import type { PricingBilling, RegistrationSubscriptionPricingProps } from '../types';
import {
  CATALOG_ERROR_CODE,
  packSelectionPayload,
  packsContinuePayload,
  planSelectionPayload,
  pricingBodyKind,
  pricingCurrency,
  pricingSections,
  togglePackSelection,
  visibleTiers,
} from './pricingViewModel';

export function RegistrationSubscriptionPricing({
  appId,
  currency,
  labels: labelOverrides,
  contactUrl,
  onError,
  style,
  testID,
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
  loadingFallback,
  errorFallback,
  onSelect,
}: RegistrationSubscriptionPricingProps) {
  const client = useWildwood();
  const resolvedAppId = appId ?? client.config.appId ?? '';
  const labels = useMemo(() => resolveRegistrationSubscriptionLabels(labelOverrides), [labelOverrides]);

  const { catalog, loading, error, refresh } = usePublicCatalog(resolvedAppId, { currency });

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

  const displayCurrency = pricingCurrency(currency, catalog);
  const tiers = useMemo(() => visibleTiers(catalog, offerFreeTierChoice), [catalog, offerFreeTierChoice]);
  const sections = pricingSections({ showPlans, showAddOns });

  const togglePack = useCallback(
    (addOnId: string) => {
      setSelectedPackIds((current) => togglePackSelection(catalog, current, addOnId));
    },
    [catalog],
  );

  const handleSelectTier = useCallback(
    (tier: AppTierModel) => {
      onSelect(planSelectionPayload(tier, billing, selectedPackIds));
    },
    [billing, onSelect, selectedPackIds],
  );

  const handleChoosePack = useCallback(
    (addOn: AppTierAddOnModel) => {
      onSelect(packSelectionPayload(addOn.id, billing));
    },
    [billing, onSelect],
  );

  const handleContinueWithPacks = useCallback(() => {
    onSelect(packsContinuePayload(billing, selectedPackIds));
  }, [billing, onSelect, selectedPackIds]);

  const kind = pricingBodyKind({ catalog, loading, error });

  let body;
  if (kind === 'error') {
    // Never a stale price and never an invented one: when the catalog cannot be read the prices go
    // away with it.
    body = errorFallback ?? (
      <View style={styles.unavailable} accessibilityRole="alert">
        <Text style={styles.unavailableText}>{labels.pricingUnavailable}</Text>
        <Pressable
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel={labels.retry}
          testID="pricing-retry"
          onPress={() => void refresh()}
        >
          <Text style={styles.retryButtonText}>{labels.retry}</Text>
        </Pressable>
      </View>
    );
  } else if (kind === 'loading') {
    body = loadingFallback ?? <PricingSkeleton label={labels.loadingPlans} />;
  } else {
    body = (
      <>
        {sections.plans ? (
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
        ) : null}

        {sections.packs ? (
          <PackGrid
            addOns={catalog?.addOns ?? []}
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
        ) : null}
      </>
    );
  }

  /* The host's id on the outer frame and the view's name on the scroller beneath it, so a host that
     names its own mount does not name it INSTEAD of the surface. There is no step element here: this
     view runs no flow, and its three bodies are how far the catalog got rather than places in an
     order. The host's style stays outermost, which is what it sized and coloured before. */
  const ids = wwViewTestIds('pricing', testID);

  return (
    <View style={[styles.container, style]} testID={ids.host}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} testID={ids.view}>
        {body}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 20 },
  unavailable: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 16,
    gap: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  unavailableText: { color: '#991B1B', fontSize: 15, fontWeight: '600' },
  retryButton: {
    borderWidth: 1,
    borderColor: '#991B1B',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  retryButtonText: { color: '#991B1B', fontSize: 15, fontWeight: '600' },
});
