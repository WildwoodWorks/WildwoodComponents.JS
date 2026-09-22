// Every decision the native pricing view makes, as functions with no React and no react-native in
// them.
//
// This package ships no component renderer under vitest, so a rule that lives inside JSX is a rule
// that cannot be tested. The view is therefore a thin arrangement of what is here: which body to
// render, which plans survive the host's options, what a pack card says about its price, how a
// selection grows and what `onSelect` is finally handed.
//
// Two rules bind the whole file, and both are the reason the component exists:
//
//  · Every price comes off the live catalog. There is no fallback price, no remembered price and no
//    "from" price in this directory - a guard test greps for one. A pack the operator has not priced
//    says so rather than implying it is free.
//  · A selection never exceeds MAX_ADDON_SELECTION, the platform-wide pack cap, and always reads in
//    catalog order rather than click order.

import type { AppTierAddOnModel, AppTierModel, AppTierPricingModel, PublicCatalog } from '@wildwood/core';
import {
  MAX_ADDON_SELECTION,
  computeAnnualDiscount,
  formatMoney,
  getSelectedPricing,
  resolvePriceOption,
  selectPacks,
} from '@wildwood/core';
import {
  formatRegistrationSubscriptionLabel as formatLabel,
  type RegistrationSubscriptionLabels,
} from '@wildwood/react-shared';
import type { AddOnGroup, PricingBilling, PricingSelection } from '../types';

/** The code `onError` reports when the catalog could not be read. */
export const CATALOG_ERROR_CODE = 'catalog_unavailable';

/** Which of the view's three bodies applies. */
export type PricingBodyKind = 'error' | 'loading' | 'content';

/** What `usePublicCatalog` is saying at this moment. */
export interface PricingCatalogState {
  catalog: PublicCatalog | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loading shows shapes, an unreadable catalog shows the unavailable panel, and only a catalog in
 * hand shows prices.
 *
 * A failure wins even when a catalog is already on screen: the prices go away with the answer that
 * produced them, rather than standing there as a quote nobody can vouch for any more.
 */
export function pricingBodyKind({ catalog, loading, error }: PricingCatalogState): PricingBodyKind {
  if (error || (!loading && !catalog)) return 'error';
  if (!catalog) return 'loading';
  return 'content';
}

/**
 * The currency the screen quotes in.
 *
 * The server names the currency its catalog is quoted in (`buildPublicCatalog` resolves it, falling
 * back to USD); the prop is an override for the rare host that knows better.
 */
export function pricingCurrency(currency: string | undefined, catalog: PublicCatalog | null): string {
  return currency ?? catalog?.currency ?? '';
}

/** The plans to show: the catalog's active plans, minus the free ones the host does not offer. */
export function visibleTiers(catalog: PublicCatalog | null, offerFreeTierChoice: boolean): AppTierModel[] {
  const all = catalog?.tiers ?? [];
  return offerFreeTierChoice ? all : all.filter((tier) => !tier.isFreeTier);
}

/** Which grids the host asked for. */
export function pricingSections(input: { showPlans: boolean; showAddOns: boolean }): {
  plans: boolean;
  packs: boolean;
} {
  return { plans: input.showPlans, packs: input.showAddOns };
}

/** Whether a plan is the one the host marked as already chosen. Ids are matched case-insensitively. */
export function isHighlightedTier(tierId: string | undefined, highlightTierId: string | undefined): boolean {
  if (!highlightTierId || !tierId) return false;
  return highlightTierId.toLowerCase() === tierId.toLowerCase();
}

/** The pricing option a plan is quoted at under the current billing cycle. */
export function planPriceOption(tier: AppTierModel, billing: PricingBilling): AppTierPricingModel | undefined {
  return getSelectedPricing(tier, billing === 'annual');
}

/** The largest annual saving on offer, or 0 when no plan is cheaper by the year. */
export function bestAnnualDiscount(tiers: AppTierModel[]): number {
  return tiers.reduce((best, tier) => {
    const discount = computeAnnualDiscount(tier);
    return discount && discount > best ? discount : best;
  }, 0);
}

/** The per-period suffix. An unrecognised frequency contributes nothing rather than a guess. */
export function billingSuffix(billingFrequency: string | undefined): string {
  switch ((billingFrequency ?? '').trim().toLowerCase()) {
    case 'monthly':
      return '/mo';
    case 'yearly':
    case 'annually':
    case 'annual':
      return '/yr';
    case 'weekly':
      return '/wk';
    case 'daily':
      return '/day';
    // OneTime, Lifetime and anything the platform adds later: the amount stands on its own.
    default:
      return '';
  }
}

/**
 * What a pack card shows where its price goes.
 *
 * A pack the operator defined but never priced says "not yet available" rather than rendering a
 * blank, a zero or the plan's price - any of which a visitor would read as "free".
 */
export function packPriceText(
  addOn: AppTierAddOnModel,
  currency: string,
  labels: RegistrationSubscriptionLabels,
): string {
  const pricing = resolvePriceOption(addOn);
  if (!pricing) return labels.packUnavailable;
  return `${formatMoney(pricing.price, currency)}${billingSuffix(pricing.billingFrequency)}`;
}

/** One rendered heading and the packs under it. */
export interface PackGroupView {
  id: string;
  title?: string;
  blurb?: string;
  addOns: AppTierAddOnModel[];
}

/**
 * The packs under the host's headings. Empty groups are dropped; packs matching no group land in a
 * trailing group titled by `morePacksTitle`. With no groups at all, one untitled group.
 *
 * The stray rule is the important one: a pack the company sells and has priced going silently
 * missing from the screen that sells it is the failure this must not have.
 */
export function groupAddOns(
  addOns: AppTierAddOnModel[],
  groups: AddOnGroup[] | undefined,
  morePacksTitle: string,
): PackGroupView[] {
  if (!groups || groups.length === 0) {
    return addOns.length > 0 ? [{ id: 'all', addOns }] : [];
  }

  const filed = groups
    .map((group) => ({
      id: group.id,
      title: group.title,
      blurb: group.blurb,
      addOns: addOns.filter((addOn) => group.categories.includes(addOn.category)),
    }))
    .filter((group) => group.addOns.length > 0);

  const known = new Set(groups.flatMap((group) => group.categories));
  const orphans = addOns.filter((addOn) => !known.has(addOn.category));

  return orphans.length > 0 ? [...filed, { id: 'more', title: morePacksTitle, addOns: orphans }] : filed;
}

/**
 * Tick or untick one pack.
 *
 * The answer is in CATALOG order rather than click order, so what comes back reads the same as the
 * grid it was picked from, and it never grows past {@link MAX_ADDON_SELECTION} - the same cap
 * `parseAddOnIdList` applies to a selection arriving in a link, so a basket built by tapping and one
 * built from a URL cannot differ. Unticking is always allowed, cap or no cap.
 */
export function togglePackSelection(
  catalog: PublicCatalog | null,
  current: readonly string[],
  addOnId: string,
): string[] {
  const selected = current.includes(addOnId);
  if (!selected && current.length >= MAX_ADDON_SELECTION) return current.slice();

  const next = new Set(current);
  if (selected) next.delete(addOnId);
  else next.add(addOnId);

  // Without a catalog there is no order to read the selection in - and no grid to have picked from.
  if (!catalog) return [];
  return selectPacks(catalog, [...next]).map((addOn) => addOn.id);
}

/** The Continue button's copy, singular when exactly one pack is ticked. */
export function continueWithPacksLabel(count: number, labels: RegistrationSubscriptionLabels): string {
  return count === 1 ? labels.continueWithOnePack : formatLabel(labels.continueWithPacks, { count });
}

/**
 * The payload a plan's call to action hands back: the plan, its option under the current cycle, and
 * whatever packs are ticked - so one tap buys the whole basket.
 */
export function planSelectionPayload(
  tier: AppTierModel,
  billing: PricingBilling,
  selectedPackIds: readonly string[],
): PricingSelection {
  return {
    tierId: tier.id,
    pricingId: planPriceOption(tier, billing)?.id,
    billing,
    addOnIds: [...selectedPackIds],
  };
}

/** The payload a single pack's call to action hands back. No plan is implied. */
export function packSelectionPayload(addOnId: string, billing: PricingBilling): PricingSelection {
  return { billing, addOnIds: [addOnId] };
}

/** The payload the multi-select Continue hands back. */
export function packsContinuePayload(billing: PricingBilling, selectedPackIds: readonly string[]): PricingSelection {
  return { billing, addOnIds: [...selectedPackIds] };
}
