/**
 * The pricing view sells what the server says the app sells, at the price the server is quoting.
 *
 * Every price assertion here goes through `formatMoney` against a figure the mocked catalog
 * returned, never against a string typed into this file — a test that hard-codes "$79.00" would
 * pass just as happily against a component that hard-codes it too, which is the one failure the
 * whole dynamic-pricing rule exists to prevent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, act, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPublicCatalog, formatMoney, type AppTierAddOnModel, type AppTierModel } from '@wildwood/core';
import { clearPublicCatalogCache } from '@wildwood/react-shared';
import {
  ClosedNotice,
  DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS,
  RegistrationAndSubscriptionComponent,
  RegistrationSubscriptionPricing,
} from '../index.js';
import type { RegistrationSubscriptionPricingProps } from '../index.js';
import { createTestClient, createWrapper } from './testUtils.js';

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
    { id: 'ao-ai', price: AI_PACK_PRICE, billingFrequency: 'Monthly', isDefault: true },
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

// ── Harness ────────────────────────────────────────────────────────────────────

function stubClient(tiers: AppTierModel[] = ALL_TIERS, addOns: AppTierAddOnModel[] = ALL_PACKS) {
  const client = createTestClient();
  return {
    client,
    tiers: vi.spyOn(client.appTier, 'getPublicTiers').mockResolvedValue(tiers),
    addOns: vi.spyOn(client.appTier, 'getPublicAddOns').mockResolvedValue(addOns),
  };
}

type Stubs = ReturnType<typeof stubClient>;

/** A request that never answers, for asserting what the view shows meanwhile. */
function pending<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

function renderPricing(props: Partial<RegistrationSubscriptionPricingProps>, stubs: Stubs = stubClient()) {
  const onSelect = props.onSelect ?? vi.fn();
  const result = render(<RegistrationSubscriptionPricing {...props} onSelect={onSelect} />, {
    wrapper: createWrapper(stubs.client),
  });
  return { ...result, onSelect, stubs };
}

/** The card whose heading is `name`. */
function tierCard(container: HTMLElement, name: string): HTMLElement {
  const cards = [...container.querySelectorAll<HTMLElement>('.ww-tier-card')];
  const card = cards.find((element) => element.querySelector('h3')?.textContent === name);
  if (!card) throw new Error(`no tier card named ${name}`);
  return card;
}

/** The element carrying a `data-ww-*` hook. */
function hook(container: HTMLElement, attribute: string, value: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[${attribute}="${value}"]`);
  if (!element) throw new Error(`no element with ${attribute}="${value}"`);
  return element;
}

beforeEach(() => {
  clearPublicCatalogCache();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearPublicCatalogCache();
});

// ── Loading and failure ────────────────────────────────────────────────────────

describe('RegistrationSubscriptionPricing - while the catalog loads', () => {
  it('shows a placeholder with no digits anywhere in it', () => {
    const stubs = stubClient();
    stubs.tiers.mockReturnValue(pending<AppTierModel[]>());
    stubs.addOns.mockReturnValue(pending<AppTierAddOnModel[]>());

    const { container } = renderPricing({}, stubs);

    expect(container.querySelector('.ww-pricing-skeleton')).not.toBeNull();
    // Not one number: a placeholder that guesses a price shows a price the server never quoted.
    expect(container.textContent ?? '').not.toMatch(/\d/);
    expect(container.querySelector('.ww-tier-card')).toBeNull();
  });

  it('uses the host loadingFallback when one is given', () => {
    const stubs = stubClient();
    stubs.tiers.mockReturnValue(pending<AppTierModel[]>());
    stubs.addOns.mockReturnValue(pending<AppTierAddOnModel[]>());

    const { container } = renderPricing({ loadingFallback: <p>Hold on</p> }, stubs);

    expect(container.textContent).toContain('Hold on');
    expect(container.querySelector('.ww-pricing-skeleton')).toBeNull();
  });
});

describe('RegistrationSubscriptionPricing - when the catalog cannot be read', () => {
  it('says so, reports it once, and retries on demand', async () => {
    const stubs = stubClient();
    stubs.tiers.mockRejectedValueOnce(new Error('catalog exploded'));
    const onError = vi.fn();

    const { container } = renderPricing({ onError }, stubs);

    await screen.findByText('Pricing is unavailable right now');
    // No stale price, no invented one.
    expect(container.textContent ?? '').not.toContain(formatMoney(PRO_MONTHLY, 'USD'));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toEqual({ code: 'catalog_unavailable', message: 'catalog exploded' });

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await screen.findByText(formatMoney(PRO_MONTHLY, 'USD'));
    expect(stubs.tiers).toHaveBeenCalledTimes(2);
  });

  it('uses the host errorFallback when one is given', async () => {
    const stubs = stubClient();
    stubs.tiers.mockRejectedValue(new Error('nope'));

    const { container } = renderPricing({ errorFallback: <p>Ask us for a quote</p> }, stubs);

    await screen.findByText('Ask us for a quote');
    expect(container.textContent).not.toContain('Pricing is unavailable right now');
  });
});

// ── Live prices ────────────────────────────────────────────────────────────────

describe('RegistrationSubscriptionPricing - prices', () => {
  it('renders the plan prices the server just quoted, under a stable view hook', async () => {
    const { container } = renderPricing({});

    await screen.findByText(formatMoney(PRO_MONTHLY, 'USD'));
    expect(container.querySelectorAll('.ww-tier-card')).toHaveLength(ALL_TIERS.length);
    expect(hook(container, 'data-ww-view', 'pricing').className).toContain('ww-regsub-pricing');
  });

  it('quotes the catalog in the currency the server named', async () => {
    const euroTiers = ALL_TIERS.map((model) => ({ ...model, currency: 'EUR' }) as AppTierModel);
    const { container } = renderPricing({}, stubClient(euroTiers, []));

    await screen.findByText(formatMoney(PRO_MONTHLY, 'EUR'));
    expect(container.textContent).not.toContain(formatMoney(PRO_MONTHLY, 'USD'));
  });

  it('lets the currency prop override the catalog', async () => {
    const euroTiers = ALL_TIERS.map((model) => ({ ...model, currency: 'EUR' }) as AppTierModel);
    const { container } = renderPricing({ currency: 'GBP' }, stubClient(euroTiers, []));

    await screen.findByText(formatMoney(PRO_MONTHLY, 'GBP'));
    expect(container.textContent).not.toContain(formatMoney(PRO_MONTHLY, 'EUR'));
  });

  it('renders an SSR snapshot on the first paint, with no flash and no request', async () => {
    const stubs = stubClient();
    const snapshot = buildPublicCatalog({ appId: 'test-app-id', tiers: ALL_TIERS, addOns: ALL_PACKS });

    const { container } = renderPricing({ initialCatalog: snapshot }, stubs);

    // Synchronously, before any effect has had a chance to fetch.
    expect(container.textContent).toContain(formatMoney(PRO_MONTHLY, 'USD'));
    expect(container.querySelector('.ww-pricing-skeleton')).toBeNull();

    await act(async () => {
      await Promise.resolve();
    });
    expect(stubs.tiers).not.toHaveBeenCalled();
    expect(stubs.addOns).not.toHaveBeenCalled();
  });
});

// ── The plan grid ──────────────────────────────────────────────────────────────

describe('RegistrationSubscriptionPricing - plans', () => {
  it('hides free plans when the host does not offer that choice', async () => {
    const { container } = renderPricing({ offerFreeTierChoice: false });

    await screen.findByText(formatMoney(PRO_MONTHLY, 'USD'));
    expect(container.querySelectorAll('.ww-tier-card')).toHaveLength(ALL_TIERS.length - 1);
    expect(screen.queryByText('Starter')).toBeNull();
  });

  it('marks the highlighted plan', async () => {
    const { container } = renderPricing({ highlightTierId: 'tier-pro' });

    await screen.findByText(formatMoney(PRO_MONTHLY, 'USD'));
    expect(tierCard(container, 'Pro').className).toContain('ww-tier-preselected');
    expect(tierCard(container, 'Starter').className).not.toContain('ww-tier-preselected');
  });

  it('hands a free plan back with its pricing option and the monthly cycle', async () => {
    const { onSelect } = renderPricing({});

    fireEvent.click(await screen.findByRole('button', { name: 'Get Started' }));

    expect(onSelect).toHaveBeenCalledWith({
      tierId: 'tier-free',
      pricingId: 'price-free',
      billing: 'monthly',
      addOnIds: [],
    });
  });

  it('switches to the annual pricing option when the toggle is flipped', async () => {
    const { onSelect } = renderPricing({});

    await screen.findByText(formatMoney(PRO_MONTHLY, 'USD'));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle annual billing' }));

    await screen.findByText(formatMoney(PRO_ANNUAL, 'USD'));
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

    expect(onSelect).toHaveBeenCalledWith({
      tierId: 'tier-pro',
      pricingId: 'price-pro-annual',
      billing: 'annual',
      addOnIds: [],
    });
  });

  it('shows the annual saving on the toggle', async () => {
    renderPricing({});
    await screen.findByText(formatMoney(PRO_MONTHLY, 'USD'));
    // Computed from the mocked prices, not written down.
    const saving = Math.round(((PRO_MONTHLY * 12 - PRO_ANNUAL) / (PRO_MONTHLY * 12)) * 100);
    expect(screen.getByText(`Save up to ${saving}%`)).toBeTruthy();
  });

  it('hides the billing toggle when the host turns it off', async () => {
    renderPricing({ showBillingToggle: false });
    await screen.findByText(formatMoney(PRO_MONTHLY, 'USD'));
    expect(screen.queryByRole('button', { name: 'Toggle annual billing' })).toBeNull();
  });

  it('starts on the annual cycle when the host asks for it', async () => {
    renderPricing({ defaultBilling: 'annual' });
    await screen.findByText(formatMoney(PRO_ANNUAL, 'USD'));
  });

  it('gives an enterprise plan a contact link instead of a buy button', async () => {
    const { container } = renderPricing({ contactUrl: '/contact?plan=enterprise' });

    await screen.findByText(formatMoney(PRO_MONTHLY, 'USD'));
    const card = tierCard(container, 'Enterprise');

    expect(within(card).queryByRole('button')).toBeNull();
    expect(within(card).getByRole('link', { name: 'Contact Sales' }).getAttribute('href')).toBe(
      '/contact?plan=enterprise',
    );
  });
});

// ── The pack grid ──────────────────────────────────────────────────────────────

describe('RegistrationSubscriptionPricing - packs', () => {
  it('files packs under the host groups, drops empty ones and keeps the strays', async () => {
    const { container } = renderPricing({ showAddOns: true, addOnGroups: GROUPS });

    await screen.findByText('Core packs');
    expect(screen.queryByText('Nothing here')).toBeNull();
    expect(screen.getByText('More packs')).toBeTruthy();

    const core = hook(container, 'data-ww-group', 'core');
    expect(within(core).getByText('Docs Pack')).toBeTruthy();
    expect(within(core).getByText('AI Pack')).toBeTruthy();

    const strays = hook(container, 'data-ww-group', 'more');
    expect(within(strays).getByText('Loose Pack')).toBeTruthy();
  });

  it('prices each pack off the catalog and says so when one has no price yet', async () => {
    const { container } = renderPricing({ showAddOns: true });

    await screen.findByText('Docs Pack');
    expect(container.textContent).toContain(`${formatMoney(DOCS_PACK_PRICE, 'USD')}/mo`);
    expect(container.textContent).toContain(`${formatMoney(AI_PACK_PRICE, 'USD')}/mo`);
    expect(container.textContent).toContain('14-day free trial');

    const loose = hook(container, 'data-ww-pack', 'pack-loose');
    expect(within(loose).getByText('Not yet available')).toBeTruthy();
  });

  it('prefers the host blurb and meter over the catalog description', async () => {
    const describeAddOn = (addOn: AppTierAddOnModel) =>
      addOn.id === 'pack-docs' ? { blurb: 'Every proposal, searchable.', meter: 'Five hundred a month' } : undefined;

    const { container } = renderPricing({ showAddOns: true, describeAddOn });

    await screen.findByText('Every proposal, searchable.');
    expect(screen.getByText('Five hundred a month')).toBeTruthy();
    expect(container.textContent).not.toContain('Upload and search documents.');
    // A pack the host has no copy for keeps the catalog's own words.
    expect(screen.getByText('Ask the assistant anything.')).toBeTruthy();
  });

  it('takes one pack straight through when there is no multi-select', async () => {
    const { onSelect } = renderPricing({ showAddOns: true });

    fireEvent.click(await screen.findByRole('button', { name: 'Select Docs Pack' }));

    expect(onSelect).toHaveBeenCalledWith({ billing: 'monthly', addOnIds: ['pack-docs'] });
  });

  it('toggles packs and continues with the whole selection', async () => {
    const { container, onSelect } = renderPricing({ showAddOns: true, packSelection: 'multi' });

    await screen.findByText('Docs Pack');
    expect(screen.getByRole('button', { name: /Continue with 0 packs/ })).toHaveProperty('disabled', true);

    // Picked out of catalog order on purpose: the payload comes back in catalog order regardless.
    fireEvent.click(screen.getByRole('button', { name: /AI Pack/ }));
    const aiCard = hook(container, 'data-ww-pack', 'pack-ai');
    await waitFor(() => expect(aiCard.getAttribute('aria-pressed')).toBe('true'));
    expect(aiCard.className).toContain('ww-pack-card--selected');
    expect(screen.getByRole('button', { name: 'Continue with 1 pack' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Docs Pack/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with 2 packs' }));

    expect(onSelect).toHaveBeenCalledWith({ billing: 'monthly', addOnIds: ['pack-docs', 'pack-ai'] });

    // Clicking again un-picks it.
    fireEvent.click(screen.getByRole('button', { name: /AI Pack/ }));
    await waitFor(() => expect(aiCard.getAttribute('aria-pressed')).toBe('false'));
  });

  it('carries the selected packs on a plan CTA when both are on the page', async () => {
    const { onSelect } = renderPricing({ showAddOns: true, packSelection: 'multi' });

    await screen.findByText('Docs Pack');
    fireEvent.click(screen.getByRole('button', { name: /Docs Pack/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Subscribe' }));

    expect(onSelect).toHaveBeenCalledWith({
      tierId: 'tier-pro',
      pricingId: 'price-pro-monthly',
      billing: 'monthly',
      addOnIds: ['pack-docs'],
    });
  });

  it('renders packs alone when the host turns the plans off', async () => {
    const { container } = renderPricing({ showPlans: false, showAddOns: true });

    await screen.findByText('Docs Pack');
    expect(container.querySelector('.ww-tier-card')).toBeNull();
    expect(container.querySelectorAll('.ww-pack-card')).toHaveLength(ALL_PACKS.length);
  });

  it('shows no packs at all unless the host asks for them', async () => {
    const { container } = renderPricing({});
    await screen.findByText(formatMoney(PRO_MONTHLY, 'USD'));
    expect(container.querySelector('.ww-pack-card')).toBeNull();
  });
});

// ── Structured data ────────────────────────────────────────────────────────────

describe('RegistrationSubscriptionPricing - JSON-LD', () => {
  it('publishes the live prices as schema.org offers', async () => {
    const { container } = renderPricing({ includeJsonLd: { url: 'https://example.test/pricing' } });

    await screen.findByText(formatMoney(PRO_MONTHLY, 'USD'));
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();

    const payload = JSON.parse(script?.textContent ?? '{}') as {
      '@graph': { name: string; price: string; priceCurrency: string; url?: string }[];
    };
    const pro = payload['@graph'].find((offer) => offer.name === 'Pro');
    expect(pro).toEqual({
      '@type': 'Offer',
      name: 'Pro',
      price: PRO_MONTHLY.toFixed(2),
      priceCurrency: 'USD',
      url: 'https://example.test/pricing',
    });
    // The enterprise plan carries no price, so it is left out rather than published at zero.
    expect(payload['@graph'].some((offer) => offer.name === 'Enterprise')).toBe(false);
  });

  it('emits nothing when the host has not asked for it', async () => {
    const { container } = renderPricing({});
    await screen.findByText(formatMoney(PRO_MONTHLY, 'USD'));
    expect(container.querySelector('script[type="application/ld+json"]')).toBeNull();
  });
});

// ── The component shell ────────────────────────────────────────────────────────

describe('RegistrationAndSubscriptionComponent', () => {
  it('delegates view="pricing" to the pricing view', async () => {
    const stubs = stubClient();
    const { container } = render(<RegistrationAndSubscriptionComponent view="pricing" onSelect={vi.fn()} />, {
      wrapper: createWrapper(stubs.client),
    });

    await screen.findByText(formatMoney(PRO_MONTHLY, 'USD'));
    expect(container.querySelector('[data-ww-view="pricing"]')).not.toBeNull();
  });

  it('delegates view="signup" to the signup view', async () => {
    const stubs = stubClient();
    vi.spyOn(stubs.client.auth, 'getAuthenticationConfiguration').mockResolvedValue({
      allowOpenRegistration: true,
      allowTokenRegistration: false,
    } as never);

    const { container } = render(<RegistrationAndSubscriptionComponent view="signup" />, {
      wrapper: createWrapper(stubs.client),
    });

    await waitFor(() => expect(container.querySelector('[data-ww-step="register"]')).not.toBeNull());
    expect(container.querySelector('[data-ww-view="signup"]')).not.toBeNull();
  });

  it('renders the manage placeholder', () => {
    const stubs = stubClient();
    const { container } = render(<RegistrationAndSubscriptionComponent view="manage" />, {
      wrapper: createWrapper(stubs.client),
    });

    expect(container.querySelector('[data-ww-view="manage"]')).not.toBeNull();
  });
});

// ── The closed-registration notice (stage 18 mounts it; it ships now) ──────────

describe('ClosedNotice', () => {
  it('says the app is closed and points at the contact link', () => {
    const { container } = render(
      <ClosedNotice
        message={DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS.registrationClosed}
        contactUrl="/contact"
        contactLabel={DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS.contactUs}
      />,
    );

    expect(screen.getByText('Registration is closed')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Contact us' }).getAttribute('href')).toBe('/contact');
    expect(container.querySelector('.ww-regsub-closed')).not.toBeNull();
  });

  it('renders no link when the host gave nowhere to go', () => {
    render(<ClosedNotice message="Closed for now" />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

// ── The dynamic-pricing guard ──────────────────────────────────────────────────

const COMPONENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../components/registrationSubscription');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('no price is ever written into the component', () => {
  const files = sourceFiles(COMPONENT_DIR);

  it('finds the component sources', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)('%s carries no price literal', (file) => {
    const source = readFileSync(file, 'utf8');
    // A currency sign followed by a figure, or an amount with cents. Either one is a price this
    // code would be stating on its own authority instead of the server's.
    expect(source.match(/\$\s*\d/g) ?? []).toEqual([]);
    expect(source.match(/\b\d+\.\d\d\b/g) ?? []).toEqual([]);
  });
});
