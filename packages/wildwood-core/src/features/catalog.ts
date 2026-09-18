// The public catalog: what an app sells, as the server last said it.
//
// Every function here is pure and SSR-safe — nothing touches window/document — so the same
// helpers build a catalog during a server render and in the browser. Prices are only ever read
// off the live public responses the caller passes in; nothing in this module persists a price,
// caches one, or falls back to one.

import type { AppTierModel, AppTierAddOnModel } from './types.js';
import { isAnnualFrequency } from './tierUtils.js';

/** The `TierStatus` the server publishes for a tier or pack that is on sale. */
export const ACTIVE_TIER_STATUS = 'Active';

/** How many packs one selection may carry. A signup link is not a shopping cart. */
export const MAX_ADDON_SELECTION = 25;

/** The query keys a catalog selection travels under. These are the keys the live sites use. */
export const CATALOG_QUERY_KEYS = {
  tier: 'tier',
  pricing: 'pricing',
  addOns: 'addons',
} as const;

/**
 * The currency used when neither the server nor the caller named one. Every price stored on the
 * platform is in US dollars, so this matches the server's own fallback.
 */
const FALLBACK_CURRENCY = 'USD';

/**
 * Locale for {@link formatMoney}. Fixed rather than the host default on purpose: a price rendered
 * on the server and re-rendered in the browser has to come out identical, and the two hosts rarely
 * agree on a default locale. Callers who want the visitor's locale pass it explicitly.
 */
const DEFAULT_LOCALE = 'en-US';

/** What an app sells, in display order, labelled with one currency. */
export interface PublicCatalog {
  appId: string;
  /** ISO code every price in this catalog is quoted in. */
  currency: string;
  tiers: AppTierModel[];
  addOns: AppTierAddOnModel[];
  /** When the catalog was built (epoch ms), for staleness checks by the caller. */
  fetchedAt: number;
}

export interface BuildPublicCatalogInput {
  appId: string;
  /** The response from the public tiers endpoint. */
  tiers?: AppTierModel[] | null;
  /** The response from the public add-ons endpoint. */
  addOns?: AppTierAddOnModel[] | null;
  /** Used only when the responses carry no currency — an older server that does not send one. */
  currencyOverride?: string;
}

/** The shape {@link resolvePriceOption} needs; both tier and add-on pricing satisfy it. */
export interface CatalogPriceOption {
  id: string;
  price: number;
  billingFrequency: string;
  isDefault: boolean;
  displayOrder?: number;
  trialDays?: number;
}

/** Which price option a caller wants: a named one, or whatever matches a billing frequency. */
export interface PriceOptionQuery {
  pricingId?: string;
  billing?: string;
}

/** A tier/pack selection, as it travels in a URL. */
export interface CatalogSelection {
  tierId?: string;
  pricingId?: string;
  addOnIds?: string[];
}

/** A selection read back out of a URL. `addOnIds` is always an array, possibly empty. */
export interface DecodedCatalogSelection {
  tierId?: string;
  pricingId?: string;
  addOnIds: string[];
}

/** A schema.org `Offer`, ready to drop into a JSON-LD graph. */
export interface JsonLdOffer {
  '@type': 'Offer';
  name: string;
  /** The live price as a string, per schema.org — never a symbol, never a formatted amount. */
  price: string;
  priceCurrency: string;
  url?: string;
}

export interface JsonLdOfferOptions {
  /** Canonical URL of the page the offers appear on. Applied to every offer as given. */
  url?: string;
}

function trimmedOrUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isActive(status: string | null | undefined): boolean {
  return (status ?? '').trim().toLowerCase() === ACTIVE_TIER_STATUS.toLowerCase();
}

function byDisplayOrder<T extends { displayOrder?: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}

/**
 * Normalise anything URL-shaped into `URLSearchParams`: a full URL, a query string with or
 * without its leading `?`, or params that are already parsed.
 */
export function asSearchParams(value: string | URLSearchParams): URLSearchParams {
  if (typeof value !== 'string') return value;
  const withoutFragment = value.split('#')[0] ?? '';
  const queryStart = withoutFragment.indexOf('?');
  return new URLSearchParams(queryStart >= 0 ? withoutFragment.slice(queryStart + 1) : withoutFragment);
}

/**
 * Build the catalog a pricing, signup or upgrade screen renders from.
 *
 * The currency is the first non-empty one the server sent on any tier or pack — it is an
 * app-level setting, so every item carries the same value — then `currencyOverride`, then USD.
 * Only items the server marks `Active` survive, in `displayOrder`.
 */
export function buildPublicCatalog(input: BuildPublicCatalogInput): PublicCatalog {
  const tiers = input.tiers ?? [];
  const addOns = input.addOns ?? [];

  const fromServer = [...tiers, ...addOns]
    .map((item) => trimmedOrUndefined(item?.currency))
    .find((currency): currency is string => currency !== undefined);

  return {
    appId: input.appId,
    currency: fromServer ?? trimmedOrUndefined(input.currencyOverride) ?? FALLBACK_CURRENCY,
    tiers: byDisplayOrder(tiers.filter((tier) => isActive(tier?.status))),
    addOns: byDisplayOrder(addOns.filter((addOn) => isActive(addOn?.status))),
    fetchedAt: Date.now(),
  };
}

function matchesBilling(candidate: string | null | undefined, wanted: string): boolean {
  // "Yearly", "Annual" and "Annually" are the same cycle to a customer, so a request for one
  // matches an option priced under any of them.
  if (isAnnualFrequency(wanted)) return isAnnualFrequency(candidate);
  return (candidate ?? '').trim().toLowerCase() === wanted.trim().toLowerCase();
}

/**
 * The price option to charge for a tier or pack: the one named by `pricingId`, else the one
 * matching `billing`, else the item's default, else the first in display order. Undefined when
 * the item sells no pricing at all (a "contact us" tier).
 */
export function resolvePriceOption<T extends CatalogPriceOption>(
  item: { pricingOptions?: T[] | null } | null | undefined,
  query: PriceOptionQuery = {},
): T | undefined {
  const options = item?.pricingOptions ?? [];
  if (options.length === 0) return undefined;

  if (query.pricingId) {
    const named = options.find((option) => option.id === query.pricingId);
    if (named) return named;
  }

  if (query.billing) {
    const matched = options.find((option) => matchesBilling(option.billingFrequency, query.billing as string));
    if (matched) return matched;
  }

  return options.find((option) => option.isDefault) ?? byDisplayOrder(options)[0];
}

/**
 * Format a live price for display.
 *
 * Always the currency's standard fraction digits, so a whole $79 renders as `$79.00` and a whole
 * ¥79 as `¥79` — the same output the older `formatPrice` gives, and the one a customer expects
 * next to a card form. The symbol comes from `Intl`, so a currency outside `CURRENCY_SYMBOLS`
 * renders correctly instead of falling back to a dollar sign.
 */
export function formatMoney(amount: number, currency: string, locale: string = DEFAULT_LOCALE): string {
  const code = (trimmedOrUndefined(currency) ?? FALLBACK_CURRENCY).toUpperCase();
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(amount);
  } catch {
    // An unknown ISO code makes Intl throw; say the amount and the code rather than nothing.
    return `${code} ${amount.toFixed(2)}`;
  }
}

/** "14-day free trial", or an empty string when the pricing starts no trial. */
export function trialLabel(days: number | null | undefined): string {
  if (!days || days <= 0) return '';
  return `${Math.trunc(days)}-day free trial`;
}

function toOffer(name: string, price: number, currency: string, url?: string): JsonLdOffer {
  const offer: JsonLdOffer = {
    '@type': 'Offer',
    name,
    price: price.toFixed(2),
    priceCurrency: currency,
  };
  if (url) offer.url = url;
  return offer;
}

/**
 * schema.org `Offer` objects for everything in the catalog that has a live price.
 *
 * No price is invented: an item with no pricing option (a "contact us" tier) and a tier whose
 * operator turned `showPrice` off are both left out rather than published at zero.
 */
export function catalogToJsonLdOffers(catalog: PublicCatalog, options: JsonLdOfferOptions = {}): JsonLdOffer[] {
  const offers: JsonLdOffer[] = [];

  for (const tier of catalog.tiers) {
    if (tier.showPrice === false) continue;
    const pricing = resolvePriceOption(tier);
    if (!pricing) continue;
    offers.push(toOffer(tier.name, pricing.price, catalog.currency, options.url));
  }

  for (const addOn of catalog.addOns) {
    const pricing = resolvePriceOption(addOn);
    if (!pricing) continue;
    offers.push(toOffer(addOn.name, pricing.price, catalog.currency, options.url));
  }

  return offers;
}

/**
 * Read a list of add-on ids out of a query value: comma- or whitespace-separated, trimmed,
 * de-duplicated and capped at {@link MAX_ADDON_SELECTION}. Pass a catalog to keep only ids the
 * app actually sells, so a hand-edited link cannot smuggle an unknown pack into a checkout.
 *
 * Accepts the repeated-parameter form (`?addons=a&addons=b`) as an array too.
 */
export function parseAddOnIdList(
  value: string | readonly string[] | null | undefined,
  catalog?: PublicCatalog | null,
): string[] {
  const parts = (Array.isArray(value) ? value : [value]) as readonly (string | null | undefined)[];
  const known = catalog ? new Set(catalog.addOns.map((addOn) => addOn.id)) : null;
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const part of parts) {
    for (const candidate of (part ?? '').split(/[\s,]+/)) {
      const id = candidate.trim();
      if (!id || seen.has(id)) continue;
      if (known && !known.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length >= MAX_ADDON_SELECTION) return ids;
    }
  }

  return ids;
}

/** The packs named by `addOnIds`, in catalog order rather than the order they were asked for. */
export function selectPacks(
  catalog: PublicCatalog,
  addOnIds: readonly string[] | null | undefined,
): AppTierAddOnModel[] {
  const wanted = new Set(addOnIds ?? []);
  if (wanted.size === 0) return [];
  return catalog.addOns.filter((addOn) => wanted.has(addOn.id));
}

/** Encode a selection as a query string (no leading `?`), under {@link CATALOG_QUERY_KEYS}. */
export function encodeCatalogSelection(selection: CatalogSelection): string {
  const params = new URLSearchParams();

  const tierId = trimmedOrUndefined(selection.tierId);
  if (tierId) params.set(CATALOG_QUERY_KEYS.tier, tierId);

  const pricingId = trimmedOrUndefined(selection.pricingId);
  if (pricingId) params.set(CATALOG_QUERY_KEYS.pricing, pricingId);

  const addOnIds = parseAddOnIdList(selection.addOnIds ?? []);
  if (addOnIds.length > 0) params.set(CATALOG_QUERY_KEYS.addOns, addOnIds.join(','));

  return params.toString();
}

/**
 * Read a selection back out of a URL, a query string or parsed params. Pass a catalog to drop
 * add-on ids the app does not sell.
 */
export function decodeCatalogSelection(
  params: URLSearchParams | string,
  catalog?: PublicCatalog | null,
): DecodedCatalogSelection {
  const search = asSearchParams(params);
  return {
    tierId: trimmedOrUndefined(search.get(CATALOG_QUERY_KEYS.tier)),
    pricingId: trimmedOrUndefined(search.get(CATALOG_QUERY_KEYS.pricing)),
    addOnIds: parseAddOnIdList(search.getAll(CATALOG_QUERY_KEYS.addOns), catalog),
  };
}
