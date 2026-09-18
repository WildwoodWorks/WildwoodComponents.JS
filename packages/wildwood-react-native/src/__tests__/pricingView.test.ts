/**
 * The native pricing view sells what the server says the app sells, at the price the server is
 * quoting.
 *
 * Every price assertion here goes through `formatMoney` against a figure the fixture catalog carries,
 * never against a string typed into this file - a test that hard-codes "$79.00" would pass just as
 * happily against a component that hard-codes it too, which is the one failure the whole
 * dynamic-pricing rule exists to prevent.
 *
 * This package has no component renderer under vitest, so the behavioural half drives the exported
 * rules the view is assembled from (`views/pricingViewModel.ts`) and the source half guards the two
 * facts a rule cannot carry: that no price is written into the component, and that no copy with a
 * label key is.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_ADDON_SELECTION,
  buildPublicCatalog,
  formatMoney,
  type AppTierAddOnModel,
  type AppTierModel,
  type PublicCatalog,
} from '@wildwood/core';
import { DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS as LABELS } from '@wildwood/react-shared';
import {
  CATALOG_ERROR_CODE,
  bestAnnualDiscount,
  billingSuffix,
  continueWithPacksLabel,
  groupAddOns,
  isHighlightedTier,
  packPriceText,
  packSelectionPayload,
  packsContinuePayload,
  planPriceOption,
  planSelectionPayload,
  pricingBodyKind,
  pricingCurrency,
  pricingSections,
  togglePackSelection,
  visibleTiers,
} from '../components/registrationSubscription/views/pricingViewModel';
import { wwGroupTestId, wwPackTestId, wwTestId } from '../components/registrationSubscription/testIds';

// ── The catalog the server is pretending to serve ──────────────────────────────

const PRO_MONTHLY = 79;
const PRO_ANNUAL = 790;
const DOCS_PACK_PRICE = 9;
const AI_PACK_PRICE = 19;

function tier(overrides: Partial<AppTierModel>): AppTierModel {
  return {
    status: 'Active',
    displayOrder: 1,
    isFreeTier: false,
    isDefault: false,
    showPrice: true,
    showSubscribeButton: true,
    showContactButton: false,
    currency: 'USD',
    pricingOptions: [],
    features: [],
    limits: [],
    ...overrides,
  } as unknown as AppTierModel;
}

function pack(overrides: Partial<AppTierAddOnModel>): AppTierAddOnModel {
  return {
    status: 'Active',
    displayOrder: 1,
    description: '',
    features: [],
    pricingOptions: [],
    bundledInTierIds: [],
    ...overrides,
  } as unknown as AppTierAddOnModel;
}

const freeTier = tier({
  id: 'tier-free',
  name: 'Starter',
  displayOrder: 1,
  isFreeTier: true,
  pricingOptions: [
    { id: 'price-free', price: 0, billingFrequency: 'Monthly', isDefault: true, displayOrder: 1 },
  ] as AppTierModel['pricingOptions'],
});

const proTier = tier({
  id: 'tier-pro',
  name: 'Pro',
  displayOrder: 2,
  pricingOptions: [
    { id: 'price-pro-monthly', price: PRO_MONTHLY, billingFrequency: 'Monthly', isDefault: true, displayOrder: 1 },
    { id: 'price-pro-annual', price: PRO_ANNUAL, billingFrequency: 'Yearly', isDefault: false, displayOrder: 2 },
  ] as AppTierModel['pricingOptions'],
});

// No pricing options at all: the platform's definition of an enterprise "contact us" plan.
const enterpriseTier = tier({ id: 'tier-ent', name: 'Enterprise', displayOrder: 3 });

const docsPack = pack({
  id: 'pack-docs',
  name: 'Docs Pack',
  category: 'Documents',
  description: 'Upload and search documents.',
  displayOrder: 1,
  pricingOptions: [
    { id: 'ao-docs', price: DOCS_PACK_PRICE, billingFrequency: 'Monthly', isDefault: true, trialDays: 14 },
  ] as AppTierAddOnModel['pricingOptions'],
});

const aiPack = pack({
  id: 'pack-ai',
  name: 'AI Pack',
  category: 'AI',
  description: 'Ask the assistant anything.',
  displayOrder: 2,
  pricingOptions: [
    { id: 'ao-ai', price: AI_PACK_PRICE, billingFrequency: 'Yearly', isDefault: true },
  ] as AppTierAddOnModel['pricingOptions'],
});

// Defined in WildwoodAdmin but never priced, and in a category no host group claims.
const loosePack = pack({ id: 'pack-loose', name: 'Loose Pack', category: 'Misc', displayOrder: 3 });

const ALL_TIERS = [freeTier, proTier, enterpriseTier];
const ALL_PACKS = [docsPack, aiPack, loosePack];

const GROUPS = [
  { id: 'core', title: 'Core packs', blurb: 'The ones most teams start with.', categories: ['Documents', 'AI'] },
  { id: 'empty', title: 'Nothing here', categories: ['Nope'] },
];

const catalog = (tiers = ALL_TIERS, addOns = ALL_PACKS, currencyOverride?: string): PublicCatalog =>
  buildPublicCatalog({ appId: 'app-1', tiers, addOns, currencyOverride });

// ── Loading, failure and retry ─────────────────────────────────────────────────

describe('pricingBodyKind', () => {
  it('shows shapes while the first catalog is on its way', () => {
    expect(pricingBodyKind({ catalog: null, loading: true, error: null })).toBe('loading');
  });

  it('shows the unavailable panel when the catalog cannot be read', () => {
    expect(pricingBodyKind({ catalog: null, loading: false, error: 'catalog exploded' })).toBe('error');
    // Prices already on screen go away with the answer that produced them.
    expect(pricingBodyKind({ catalog: catalog(), loading: false, error: 'catalog exploded' })).toBe('error');
  });

  it('treats a finished load with nothing to show as unreadable rather than as an empty shop', () => {
    expect(pricingBodyKind({ catalog: null, loading: false, error: null })).toBe('error');
  });

  it('shows prices only once a catalog is in hand', () => {
    expect(pricingBodyKind({ catalog: catalog(), loading: false, error: null })).toBe('content');
    // A background refresh must not blank what is already quoted.
    expect(pricingBodyKind({ catalog: catalog(), loading: true, error: null })).toBe('content');
  });

  it('names the failure with the code the web reports', () => {
    expect(CATALOG_ERROR_CODE).toBe('catalog_unavailable');
  });
});

// ── Live prices ────────────────────────────────────────────────────────────────

describe('pricingCurrency', () => {
  it('quotes the catalog in the currency the server named', () => {
    const euros = catalog(ALL_TIERS.map((model) => ({ ...model, currency: 'EUR' }) as AppTierModel));
    expect(pricingCurrency(undefined, euros)).toBe('EUR');
  });

  it('lets the currency prop override the catalog', () => {
    const euros = catalog(ALL_TIERS.map((model) => ({ ...model, currency: 'EUR' }) as AppTierModel));
    expect(pricingCurrency('GBP', euros)).toBe('GBP');
  });

  it('falls back to what buildPublicCatalog resolved, never to a currency of its own', () => {
    // No server currency and no prop: the catalog's own fallback (USD) is the answer, and the view
    // adds nothing to it.
    const noCurrency = catalog(
      ALL_TIERS.map((model) => ({ ...model, currency: undefined }) as unknown as AppTierModel),
      [],
    );
    expect(pricingCurrency(undefined, noCurrency)).toBe('USD');
    expect(pricingCurrency(undefined, null)).toBe('');
  });
});

describe('planPriceOption', () => {
  it('quotes a plan at the option for the chosen billing period', () => {
    const pro = catalog().tiers.find((model) => model.id === 'tier-pro')!;

    expect(planPriceOption(pro, 'monthly')).toMatchObject({ id: 'price-pro-monthly', price: PRO_MONTHLY });
    expect(planPriceOption(pro, 'annual')).toMatchObject({ id: 'price-pro-annual', price: PRO_ANNUAL });
  });

  it('quotes a contact-us plan at nothing at all', () => {
    const ent = catalog().tiers.find((model) => model.id === 'tier-ent')!;
    expect(planPriceOption(ent, 'monthly')).toBeUndefined();
  });

  it('computes the best annual saving from the live prices', () => {
    const saving = Math.round(((PRO_MONTHLY * 12 - PRO_ANNUAL) / (PRO_MONTHLY * 12)) * 100);
    expect(bestAnnualDiscount(catalog().tiers)).toBe(saving);
    expect(bestAnnualDiscount([freeTier])).toBe(0);
  });
});

describe('packPriceText', () => {
  it('prices each pack off the catalog, per period', () => {
    expect(packPriceText(docsPack, 'USD', LABELS)).toBe(`${formatMoney(DOCS_PACK_PRICE, 'USD')}/mo`);
    expect(packPriceText(aiPack, 'USD', LABELS)).toBe(`${formatMoney(AI_PACK_PRICE, 'USD')}/yr`);
  });

  it('says a pack has no price yet rather than implying it is free', () => {
    expect(packPriceText(loosePack, 'USD', LABELS)).toBe(LABELS.packUnavailable);
  });

  it('prices a currency outside the old symbol table as itself', () => {
    // CHF is where the legacy `formatPrice` quoted francs with a dollar sign.
    expect(packPriceText(docsPack, 'CHF', LABELS)).toContain(formatMoney(DOCS_PACK_PRICE, 'CHF'));
    expect(packPriceText(docsPack, 'CHF', LABELS)).not.toContain('$');
  });

  it('adds nothing to a frequency it does not recognise', () => {
    expect(billingSuffix('OneTime')).toBe('');
    expect(billingSuffix(undefined)).toBe('');
    expect(billingSuffix('Weekly')).toBe('/wk');
    expect(billingSuffix('Daily')).toBe('/day');
    expect(billingSuffix('Annually')).toBe('/yr');
  });
});

// ── The plan grid ──────────────────────────────────────────────────────────────

describe('visibleTiers', () => {
  it('keeps every active plan by default', () => {
    expect(visibleTiers(catalog(), true).map((model) => model.id)).toEqual(['tier-free', 'tier-pro', 'tier-ent']);
  });

  it('hides free plans when the host does not offer that choice', () => {
    expect(visibleTiers(catalog(), false).map((model) => model.id)).toEqual(['tier-pro', 'tier-ent']);
  });

  it('has nothing to show without a catalog', () => {
    expect(visibleTiers(null, true)).toEqual([]);
  });
});

describe('isHighlightedTier', () => {
  it('marks the plan a pricing link carried in, whatever the casing', () => {
    expect(isHighlightedTier('tier-pro', 'TIER-PRO')).toBe(true);
    expect(isHighlightedTier('tier-free', 'tier-pro')).toBe(false);
    expect(isHighlightedTier('tier-pro', undefined)).toBe(false);
  });
});

describe('pricingSections', () => {
  it('renders the plan grid alone by default', () => {
    expect(pricingSections({ showPlans: true, showAddOns: false })).toEqual({ plans: true, packs: false });
  });

  it('renders packs alone when the host turns the plans off', () => {
    expect(pricingSections({ showPlans: false, showAddOns: true })).toEqual({ plans: false, packs: true });
  });
});

// ── The pack grid ──────────────────────────────────────────────────────────────

describe('groupAddOns', () => {
  it('files packs under the host groups, drops empty ones and keeps the strays', () => {
    const grouped = groupAddOns(ALL_PACKS, GROUPS, LABELS.morePacks);

    expect(grouped.map((group) => group.id)).toEqual(['core', 'more']);
    expect(grouped[0]?.addOns.map((model) => model.id)).toEqual(['pack-docs', 'pack-ai']);
    expect(grouped[1]).toMatchObject({ title: LABELS.morePacks });
    expect(grouped[1]?.addOns.map((model) => model.id)).toEqual(['pack-loose']);
  });

  it('renders one flat, untitled group when the host names none', () => {
    expect(groupAddOns(ALL_PACKS, undefined, LABELS.morePacks)).toEqual([{ id: 'all', addOns: ALL_PACKS }]);
    expect(groupAddOns([], undefined, LABELS.morePacks)).toEqual([]);
  });

  it('drops the catch-all when every pack found a home', () => {
    const grouped = groupAddOns([docsPack, aiPack], GROUPS, LABELS.morePacks);
    expect(grouped.map((group) => group.id)).toEqual(['core']);
  });
});

describe('togglePackSelection', () => {
  const live = catalog();

  it('returns the selection in catalog order, not click order', () => {
    const picked = togglePackSelection(live, ['pack-ai'], 'pack-docs');
    expect(picked).toEqual(['pack-docs', 'pack-ai']);
  });

  it('unticks a pack that is already ticked', () => {
    expect(togglePackSelection(live, ['pack-docs', 'pack-ai'], 'pack-ai')).toEqual(['pack-docs']);
    expect(togglePackSelection(live, ['pack-docs'], 'pack-docs')).toEqual([]);
  });

  it('stops at the platform pack cap, and still lets a pack be given back', () => {
    const many = Array.from({ length: MAX_ADDON_SELECTION }, (_, index) =>
      pack({ id: `pack-${index}`, name: `Pack ${index}`, category: 'Bulk', displayOrder: index }),
    );
    const bulky = catalog([], [...many, docsPack]);
    const full = many.map((model) => model.id);

    expect(full).toHaveLength(MAX_ADDON_SELECTION);
    // One more would be 26: refused, and the basket is unchanged.
    expect(togglePackSelection(bulky, full, 'pack-docs')).toEqual(full);
    // Unticking is never capped.
    expect(togglePackSelection(bulky, full, full[0]!)).toHaveLength(MAX_ADDON_SELECTION - 1);
  });

  it('has nothing to select from before the catalog arrives', () => {
    expect(togglePackSelection(null, [], 'pack-docs')).toEqual([]);
  });
});

describe('continueWithPacksLabel', () => {
  it('counts packs in words the host can translate', () => {
    expect(continueWithPacksLabel(0, LABELS)).toBe('Continue with 0 packs');
    expect(continueWithPacksLabel(1, LABELS)).toBe(LABELS.continueWithOnePack);
    expect(continueWithPacksLabel(2, LABELS)).toBe('Continue with 2 packs');
  });
});

// ── What the host is handed ────────────────────────────────────────────────────

describe('the onSelect payloads', () => {
  const live = catalog();
  const pro = live.tiers.find((model) => model.id === 'tier-pro')!;
  const free = live.tiers.find((model) => model.id === 'tier-free')!;

  it('hands a free plan back with its pricing option and the monthly cycle', () => {
    expect(planSelectionPayload(free, 'monthly', [])).toEqual({
      tierId: 'tier-free',
      pricingId: 'price-free',
      billing: 'monthly',
      addOnIds: [],
    });
  });

  it('switches to the annual pricing option when the toggle is flipped', () => {
    expect(planSelectionPayload(pro, 'annual', [])).toEqual({
      tierId: 'tier-pro',
      pricingId: 'price-pro-annual',
      billing: 'annual',
      addOnIds: [],
    });
  });

  it('carries the ticked packs on a plan call to action', () => {
    expect(planSelectionPayload(pro, 'monthly', ['pack-docs'])).toEqual({
      tierId: 'tier-pro',
      pricingId: 'price-pro-monthly',
      billing: 'monthly',
      addOnIds: ['pack-docs'],
    });
  });

  it('copies the selection rather than handing the host the live array', () => {
    const selection = ['pack-docs'];
    const payload = planSelectionPayload(pro, 'monthly', selection);
    selection.push('pack-ai');
    expect(payload.addOnIds).toEqual(['pack-docs']);
  });

  it('takes one pack straight through, implying no plan', () => {
    expect(packSelectionPayload('pack-docs', 'monthly')).toEqual({ billing: 'monthly', addOnIds: ['pack-docs'] });
  });

  it('continues with the whole basket', () => {
    expect(packsContinuePayload('annual', ['pack-docs', 'pack-ai'])).toEqual({
      billing: 'annual',
      addOnIds: ['pack-docs', 'pack-ai'],
    });
  });
});

// ── Test hooks ─────────────────────────────────────────────────────────────────

describe('the test hooks', () => {
  it('carries the web attribute values across, unchanged', () => {
    expect(wwTestId('pricing')).toBe('pricing');
    expect(wwTestId('signup', 'register')).toBe('register');
    expect(wwTestId('manage', '')).toBe('manage');
  });

  it('keeps a pack apart from a group of the same name', () => {
    expect(wwPackTestId('core')).not.toBe(wwGroupTestId('core'));
    expect(wwPackTestId('pack-docs')).toContain('pack-docs');
    expect(wwGroupTestId('more')).toContain('more');
  });
});

// ── Source guards ──────────────────────────────────────────────────────────────

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT_DIR = resolve(SRC, 'components/registrationSubscription');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const FILES = sourceFiles(COMPONENT_DIR);

describe('no price is ever written into the component', () => {
  it('finds the component sources', () => {
    expect(FILES.length).toBeGreaterThan(5);
  });

  it.each(FILES)('%s carries no price literal', (file) => {
    const source = readFileSync(file, 'utf8');
    // A currency sign followed by a figure, or an amount with cents. Either one is a price this
    // code would be stating on its own authority instead of the server's.
    expect(source.match(/\$\s*\d/g) ?? []).toEqual([]);
    expect(source.match(/\b\d+\.\d\d\b/g) ?? []).toEqual([]);
  });
});

/** The code, without the comments - which quote the web's attributes and copy on purpose. */
const readCode = (file: string) =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the copy comes from the shared labels', () => {
  // Every string here has a label key, so a host that translates the component must not find one of
  // them nailed to the source.
  const LABELLED = [
    LABELS.pricingUnavailable,
    LABELS.retry,
    LABELS.loadingPlans,
    LABELS.morePacks,
    LABELS.packUnavailable,
    LABELS.packSelect,
    LABELS.billingMonthly,
    LABELS.billingAnnual,
    LABELS.billingToggleAriaLabel,
    LABELS.continueWithOnePack,
  ];

  it.each(FILES)('%s hard-codes no labelled copy', (file) => {
    const source = readCode(file);
    for (const copy of LABELLED) {
      expect(source).not.toContain(`'${copy}'`);
      expect(source).not.toContain(`"${copy}"`);
    }
  });
});

describe('the view is native', () => {
  it.each(FILES)('%s uses no web-only API', (file) => {
    const source = readCode(file);
    expect(source).not.toMatch(/\bclassName\b/);
    expect(source).not.toMatch(/\baria-[a-z]+=/);
    expect(source).not.toMatch(/\b(?:window|document)\./);
    expect(source).not.toMatch(/\bhtml2canvas\b/);
  });
});

describe('the pricing view source', () => {
  const source = readCode(resolve(COMPONENT_DIR, 'views/RegistrationSubscriptionPricing.tsx'));

  it('reads the live catalog and never seeds a price of its own', () => {
    expect(source).toContain('usePublicCatalog(resolvedAppId, { currency })');
    expect(source).not.toContain('initialCatalog');
  });

  it('draws the skeleton with no numbers, and only while loading', () => {
    expect(source).toContain("kind === 'loading'");
    expect(source).toContain('<PricingSkeleton label={labels.loadingPlans} />');
    // The skeleton itself formats nothing.
    expect(readCode(resolve(COMPONENT_DIR, 'parts/PricingSkeleton.tsx'))).not.toContain('formatMoney');
  });

  it('offers a Retry that re-fetches, rather than one that re-renders', () => {
    expect(source).toContain('onPress={() => void refresh()}');
  });

  it('reports a distinct failure once', () => {
    expect(source).toContain('if (reported.current === error) return;');
    expect(source).toContain('onError?.({ code: CATALOG_ERROR_CODE, message: error })');
  });

  it('reuses the package tier card rather than growing a second plan card', () => {
    expect(readCode(resolve(COMPONENT_DIR, 'parts/PlanGrid.tsx'))).toContain("from '../../tier/TierCard'");
  });
});
