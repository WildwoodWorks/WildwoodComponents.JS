import { describe, it, expect } from 'vitest';
import {
  MAX_ADDON_SELECTION,
  buildPublicCatalog,
  resolvePriceOption,
  formatMoney,
  trialLabel,
  catalogToJsonLdOffers,
  parseAddOnIdList,
  selectPacks,
  encodeCatalogSelection,
  decodeCatalogSelection,
  asSearchParams,
} from '../features/catalog.js';
import type { AppTierModel, AppTierAddOnModel, AppTierPricingModel } from '../features/types.js';

function pricing(overrides: Partial<AppTierPricingModel> = {}): AppTierPricingModel {
  return {
    id: 'price-1',
    appTierId: 'tier-1',
    pricingModelId: 'pm-1',
    isDefault: false,
    displayOrder: 0,
    pricingModelName: 'Monthly',
    price: 79,
    billingFrequency: 'Monthly',
    ...overrides,
  };
}

function tier(overrides: Partial<AppTierModel> = {}): AppTierModel {
  return {
    id: 'tier-1',
    appId: 'app-1',
    name: 'Pro',
    description: 'Everything',
    displayOrder: 0,
    isDefault: false,
    isFreeTier: false,
    allowUpgrades: true,
    allowDowngrades: true,
    status: 'Active',
    badgeColor: '',
    iconClass: '',
    showSubscribeButton: true,
    showContactButton: false,
    showPrice: true,
    pricingOptions: [pricing()],
    features: [],
    limits: [],
    ...overrides,
  };
}

function addOn(overrides: Partial<AppTierAddOnModel> = {}): AppTierAddOnModel {
  return {
    id: 'addon-1',
    appId: 'app-1',
    name: 'Radar',
    description: 'Pack',
    category: '',
    status: 'Active',
    displayOrder: 0,
    iconClass: '',
    badgeColor: '',
    features: [],
    pricingOptions: [
      {
        id: 'ap-1',
        pricingModelId: 'pm-2',
        pricingModelName: 'Monthly',
        price: 19,
        billingFrequency: 'Monthly',
        isDefault: true,
      },
    ],
    bundledInTierIds: [],
    ...overrides,
  };
}

describe('buildPublicCatalog', () => {
  it('takes the currency the server sent, in preference to the override', () => {
    const catalog = buildPublicCatalog({
      appId: 'app-1',
      tiers: [tier({ currency: 'GBP' })],
      addOns: [addOn({ currency: 'EUR' })],
      currencyOverride: 'CAD',
    });

    expect(catalog.currency).toBe('GBP');
  });

  it('falls back to the override, then to USD, when no response carries a currency', () => {
    expect(buildPublicCatalog({ appId: 'app-1', tiers: [tier()], currencyOverride: 'CAD' }).currency).toBe('CAD');

    // An add-on can supply it just as well as a tier — it is one app-level setting.
    expect(
      buildPublicCatalog({ appId: 'app-1', tiers: [tier()], addOns: [addOn({ currency: ' EUR ' })] }).currency,
    ).toBe('EUR');

    expect(buildPublicCatalog({ appId: 'app-1' }).currency).toBe('USD');
    // An empty string on the wire is not an answer.
    expect(buildPublicCatalog({ appId: 'app-1', tiers: [tier({ currency: '' })] }).currency).toBe('USD');
  });

  it('keeps only Active items, in display order', () => {
    const catalog = buildPublicCatalog({
      appId: 'app-1',
      tiers: [
        tier({ id: 'late', displayOrder: 3 }),
        tier({ id: 'retired', status: 'Deprecated', displayOrder: 1 }),
        tier({ id: 'early', displayOrder: 1 }),
      ],
      addOns: [
        addOn({ id: 'b', displayOrder: 2 }),
        addOn({ id: 'off', status: 'Inactive', displayOrder: 0 }),
        addOn({ id: 'a', displayOrder: 1 }),
      ],
    });

    expect(catalog.tiers.map((t) => t.id)).toEqual(['early', 'late']);
    expect(catalog.addOns.map((a) => a.id)).toEqual(['a', 'b']);
    expect(catalog.appId).toBe('app-1');
    expect(typeof catalog.fetchedAt).toBe('number');
  });

  it('does not mutate the responses it was given', () => {
    const tiers = [tier({ id: 'b', displayOrder: 2 }), tier({ id: 'a', displayOrder: 1 })];
    buildPublicCatalog({ appId: 'app-1', tiers });
    expect(tiers.map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('resolvePriceOption', () => {
  const monthly = pricing({ id: 'm', billingFrequency: 'Monthly', displayOrder: 2 });
  const yearly = pricing({ id: 'y', billingFrequency: 'Yearly', displayOrder: 3, price: 790 });
  const preferred = pricing({ id: 'd', billingFrequency: 'Quarterly', isDefault: true, displayOrder: 4 });
  const first = pricing({ id: 'f', billingFrequency: 'Weekly', displayOrder: 1 });

  it('prefers the named option', () => {
    expect(resolvePriceOption(tier({ pricingOptions: [monthly, yearly] }), { pricingId: 'y' })?.id).toBe('y');
  });

  it('falls back to the billing frequency, matching annual synonyms', () => {
    const item = tier({ pricingOptions: [monthly, yearly] });
    expect(resolvePriceOption(item, { pricingId: 'gone', billing: 'Monthly' })?.id).toBe('m');
    expect(resolvePriceOption(item, { billing: 'annual' })?.id).toBe('y');
    expect(resolvePriceOption(item, { billing: 'MONTHLY' })?.id).toBe('m');
  });

  it('falls back to the default option, then to the first in display order', () => {
    expect(resolvePriceOption(tier({ pricingOptions: [first, monthly, preferred] }), { billing: 'Daily' })?.id).toBe(
      'd',
    );
    expect(resolvePriceOption(tier({ pricingOptions: [monthly, first] }), { billing: 'Daily' })?.id).toBe('f');
  });

  it('returns undefined when the item sells no pricing', () => {
    expect(resolvePriceOption(tier({ pricingOptions: [] }))).toBeUndefined();
    expect(resolvePriceOption(undefined)).toBeUndefined();
  });

  it('works on add-on pricing, which carries no display order', () => {
    expect(resolvePriceOption(addOn())?.id).toBe('ap-1');
  });
});

describe('formatMoney', () => {
  it('uses the currency standard fraction digits, never a hard-coded symbol', () => {
    expect(formatMoney(79, 'USD')).toBe('$79.00');
    expect(formatMoney(79.5, 'USD')).toBe('$79.50');
    expect(formatMoney(790, 'EUR')).toBe('€790.00');
    expect(formatMoney(12.34, 'GBP')).toBe('£12.34');
    // A zero-decimal currency keeps zero decimals.
    expect(formatMoney(79, 'JPY')).toBe('¥79');
  });

  it('honours a locale and a lower-cased code, and defaults a missing currency to USD', () => {
    expect(formatMoney(79, 'eur')).toBe('€79.00');
    expect(formatMoney(79, 'EUR', 'de-DE')).toContain('79,00');
    expect(formatMoney(79, '')).toBe('$79.00');
  });

  it('degrades to the code and the amount for an unknown currency', () => {
    expect(formatMoney(79, 'ZZZZ')).toBe('ZZZZ 79.00');
  });
});

describe('trialLabel', () => {
  it('names the trial, and says nothing when there is none', () => {
    expect(trialLabel(14)).toBe('14-day free trial');
    expect(trialLabel(1)).toBe('1-day free trial');
    expect(trialLabel(0)).toBe('');
    expect(trialLabel(undefined)).toBe('');
    expect(trialLabel(-7)).toBe('');
  });
});

describe('catalogToJsonLdOffers', () => {
  it('publishes live prices only, and never invents one', () => {
    const catalog = buildPublicCatalog({
      appId: 'app-1',
      tiers: [
        tier({ id: 'pro', name: 'Pro', currency: 'USD', pricingOptions: [pricing({ price: 79, isDefault: true })] }),
        // No pricing at all: a "contact us" tier must not appear as an offer.
        tier({ id: 'enterprise', name: 'Enterprise', displayOrder: 1, pricingOptions: [] }),
        // The operator hides the price, so it is not published as structured data either.
        tier({ id: 'secret', name: 'Secret', displayOrder: 2, showPrice: false }),
      ],
      addOns: [addOn({ id: 'radar', name: 'Radar' })],
    });

    const offers = catalogToJsonLdOffers(catalog, { url: 'https://example.test/pricing' });

    expect(offers).toEqual([
      { '@type': 'Offer', name: 'Pro', price: '79.00', priceCurrency: 'USD', url: 'https://example.test/pricing' },
      { '@type': 'Offer', name: 'Radar', price: '19.00', priceCurrency: 'USD', url: 'https://example.test/pricing' },
    ]);
  });

  it('omits the url when none was given', () => {
    const catalog = buildPublicCatalog({ appId: 'app-1', tiers: [tier({ currency: 'EUR' })] });
    expect(catalogToJsonLdOffers(catalog)).toEqual([
      { '@type': 'Offer', name: 'Pro', price: '79.00', priceCurrency: 'EUR' },
    ]);
  });
});

describe('parseAddOnIdList', () => {
  it('trims, splits on commas and whitespace, and de-duplicates', () => {
    expect(parseAddOnIdList(' a, b  c ,,a ')).toEqual(['a', 'b', 'c']);
    expect(parseAddOnIdList(['a', 'b,a'])).toEqual(['a', 'b']);
    expect(parseAddOnIdList('')).toEqual([]);
    expect(parseAddOnIdList(null)).toEqual([]);
    expect(parseAddOnIdList(undefined)).toEqual([]);
  });

  it(`caps the selection at ${MAX_ADDON_SELECTION}`, () => {
    const many = Array.from({ length: MAX_ADDON_SELECTION + 10 }, (_, i) => `a${i}`);
    expect(parseAddOnIdList(many.join(','))).toHaveLength(MAX_ADDON_SELECTION);
  });

  it('keeps only ids the catalog sells when one is given', () => {
    const catalog = buildPublicCatalog({
      appId: 'app-1',
      addOns: [addOn({ id: 'radar' }), addOn({ id: 'vault', displayOrder: 1 })],
    });

    expect(parseAddOnIdList('radar,smuggled,vault', catalog)).toEqual(['radar', 'vault']);
    // The cap counts what survives the filter, not what was asked for.
    expect(parseAddOnIdList('nope', catalog)).toEqual([]);
  });
});

describe('selectPacks', () => {
  it('returns the packs in catalog order, not the order they were asked for', () => {
    const catalog = buildPublicCatalog({
      appId: 'app-1',
      addOns: [
        addOn({ id: 'a', displayOrder: 1 }),
        addOn({ id: 'b', displayOrder: 2 }),
        addOn({ id: 'c', displayOrder: 3 }),
      ],
    });

    expect(selectPacks(catalog, ['c', 'a']).map((p) => p.id)).toEqual(['a', 'c']);
    expect(selectPacks(catalog, ['unknown'])).toEqual([]);
    expect(selectPacks(catalog, [])).toEqual([]);
    expect(selectPacks(catalog, undefined)).toEqual([]);
  });
});

describe('catalog selection round trip', () => {
  it('encodes and decodes under the tier/pricing/addons keys', () => {
    const encoded = encodeCatalogSelection({ tierId: 'tier-1', pricingId: 'price-1', addOnIds: ['a', 'b', 'a'] });

    expect(decodeCatalogSelection(encoded)).toEqual({
      tierId: 'tier-1',
      pricingId: 'price-1',
      addOnIds: ['a', 'b'],
    });
  });

  it('decodes a full URL, a leading ?, repeated params and parsed params', () => {
    expect(decodeCatalogSelection('https://example.test/signup?tier=t1&addons=a&addons=b#top')).toEqual({
      tierId: 't1',
      pricingId: undefined,
      addOnIds: ['a', 'b'],
    });

    expect(decodeCatalogSelection('?tier= t1 &pricing=')).toEqual({
      tierId: 't1',
      pricingId: undefined,
      addOnIds: [],
    });

    expect(decodeCatalogSelection(new URLSearchParams({ tier: 't1' })).tierId).toBe('t1');
  });

  it('encodes nothing for an empty selection', () => {
    expect(encodeCatalogSelection({})).toBe('');
    expect(encodeCatalogSelection({ tierId: '  ', addOnIds: [] })).toBe('');
  });

  it('asSearchParams normalises every URL shape', () => {
    expect(asSearchParams('a=1').get('a')).toBe('1');
    expect(asSearchParams('?a=1').get('a')).toBe('1');
    expect(asSearchParams('https://example.test/x?a=1').get('a')).toBe('1');
    expect(asSearchParams('').get('a')).toBeNull();
  });
});
