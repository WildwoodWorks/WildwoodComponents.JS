/**
 * RegistrationAndSubscriptionComponent, in a browser, against a mocked server.
 *
 * Everything the component reads is stubbed with `page.route`, so the run needs no API, no session
 * and no .env: the harness page takes its app id from `?appId=`, and the two public catalog
 * endpoints plus the authentication configuration are fulfilled here.
 *
 * Prices are asserted against a figure formatted in this spec with the same `Intl` options the SDK
 * uses, never against a string typed in by hand — a literal "$79.00" would pass just as happily
 * against a component that hard-codes it, which is the one failure the dynamic-pricing rule exists
 * to prevent.
 */
import { test, expect, type Page } from '@playwright/test';

const APP_ID = 'e2e-app';

const PRO_MONTHLY = 79;
const PRO_ANNUAL = 790;
const DOCS_PACK = 9;
const AI_PACK = 19;
const AUTOMATION_PACK = 4;

/** The SDK formats money through `Intl` with a fixed locale; so does this spec. */
function money(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

const TIERS = [
  {
    id: 'tier-starter',
    appId: APP_ID,
    name: 'Starter',
    description: 'Free to begin with.',
    displayOrder: 1,
    isDefault: true,
    isFreeTier: true,
    allowUpgrades: true,
    allowDowngrades: true,
    status: 'Active',
    badgeColor: '',
    iconClass: '',
    showSubscribeButton: true,
    showContactButton: false,
    showPrice: true,
    currency: 'USD',
    pricingOptions: [
      {
        id: 'price-starter',
        appTierId: 'tier-starter',
        pricingModelId: 'pm-starter',
        pricingModelName: 'Starter',
        isDefault: true,
        displayOrder: 1,
        price: 0,
        billingFrequency: 'Monthly',
      },
    ],
    features: [],
    limits: [],
  },
  {
    id: 'tier-pro',
    appId: APP_ID,
    name: 'Pro',
    description: 'For a team winning work.',
    displayOrder: 2,
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
    currency: 'USD',
    pricingOptions: [
      {
        id: 'price-pro-monthly',
        appTierId: 'tier-pro',
        pricingModelId: 'pm-pro-monthly',
        pricingModelName: 'Pro monthly',
        isDefault: true,
        displayOrder: 1,
        price: PRO_MONTHLY,
        billingFrequency: 'Monthly',
      },
      {
        id: 'price-pro-annual',
        appTierId: 'tier-pro',
        pricingModelId: 'pm-pro-annual',
        pricingModelName: 'Pro annual',
        isDefault: false,
        displayOrder: 2,
        price: PRO_ANNUAL,
        billingFrequency: 'Yearly',
      },
    ],
    features: [],
    limits: [],
  },
  // Retired: `buildPublicCatalog` keeps Active items only, so this must not reach the grid.
  {
    id: 'tier-legacy',
    appId: APP_ID,
    name: 'Legacy',
    description: 'No longer sold.',
    displayOrder: 3,
    isDefault: false,
    isFreeTier: false,
    allowUpgrades: false,
    allowDowngrades: false,
    status: 'Retired',
    badgeColor: '',
    iconClass: '',
    showSubscribeButton: true,
    showContactButton: false,
    showPrice: true,
    currency: 'USD',
    pricingOptions: [],
    features: [],
    limits: [],
  },
];

const ADD_ONS = [
  {
    id: 'pack-docs',
    appId: APP_ID,
    name: 'Documents Pack',
    description: 'Upload and search your own documents.',
    category: 'Documents',
    status: 'Active',
    displayOrder: 1,
    iconClass: '',
    badgeColor: '',
    currency: 'USD',
    features: [],
    pricingOptions: [
      {
        id: 'price-docs',
        pricingModelId: 'pm-docs',
        pricingModelName: 'Documents',
        price: DOCS_PACK,
        billingFrequency: 'Monthly',
        isDefault: true,
      },
    ],
    bundledInTierIds: [],
  },
  {
    id: 'pack-ai',
    appId: APP_ID,
    name: 'AI Pack',
    description: 'Drafting and enrichment.',
    category: 'Content',
    status: 'Active',
    displayOrder: 2,
    iconClass: '',
    badgeColor: '',
    currency: 'USD',
    features: [],
    pricingOptions: [
      {
        id: 'price-ai',
        pricingModelId: 'pm-ai',
        pricingModelName: 'AI',
        price: AI_PACK,
        billingFrequency: 'Monthly',
        isDefault: true,
      },
    ],
    bundledInTierIds: [],
  },
  // A category none of the page's groups claim: it belongs in the trailing catch-all group, not
  // dropped from the page that sells it.
  {
    id: 'pack-automation',
    appId: APP_ID,
    name: 'Automation Pack',
    description: 'Scheduled runs.',
    category: 'Automation',
    status: 'Active',
    displayOrder: 3,
    iconClass: '',
    badgeColor: '',
    currency: 'USD',
    features: [],
    pricingOptions: [
      {
        id: 'price-automation',
        pricingModelId: 'pm-automation',
        pricingModelName: 'Automation',
        price: AUTOMATION_PACK,
        billingFrequency: 'Monthly',
        isDefault: true,
      },
    ],
    bundledInTierIds: [],
  },
];

interface RegistrationFlags {
  allowOpenRegistration: boolean;
  allowTokenRegistration: boolean;
}

function authConfiguration({ allowOpenRegistration, allowTokenRegistration }: RegistrationFlags) {
  return {
    isEnabled: true,
    defaultProvider: 'Local',
    allowLocalAuth: true,
    requireEmailVerification: false,
    allowPasswordReset: true,
    showDetailedErrors: false,
    allowTokenRegistration,
    allowOpenRegistration,
    requireEmailVerificationForOpenRegistration: false,
    hasEmailConfiguration: true,
    registrationRateLimitPerHour: 10,
    registrationRateLimitPerDay: 50,
    registrationRateLimitPerIpPerHour: 10,
    passwordMinimumLength: 8,
    passwordRequireDigit: true,
    passwordRequireLowercase: true,
    passwordRequireUppercase: true,
    passwordRequireSpecialChar: false,
    passwordHistoryLimit: 0,
    passwordExpiryDays: 0,
  };
}

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * Stub every API call the page makes. Registered widest-first: Playwright tries the most recently
 * added route first, so the specific handlers below win over the catch-all.
 */
async function mockApi(
  page: Page,
  flags: RegistrationFlags = { allowOpenRegistration: true, allowTokenRegistration: true },
) {
  await page.route('**/api/**', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/app-tiers/*/public', (route) => route.fulfill(json(TIERS)));
  await page.route('**/api/app-tier-addons/*/public', (route) => route.fulfill(json(ADD_ONS)));
  await page.route('**/api/AppComponentConfigurations/*/auth-configuration', (route) =>
    route.fulfill(json(authConfiguration(flags))),
  );
}

function harnessUrl(view: string): string {
  return `/registration-subscription?appId=${APP_ID}&view=${view}`;
}

test.describe('Registration & Subscription component', () => {
  test('pricing view renders the live plans at the quoted price', async ({ page }) => {
    await mockApi(page);
    await page.goto(harnessUrl('pricing'));

    const pricing = page.locator('[data-ww-view="pricing"]');
    await expect(pricing).toBeVisible();

    const grid = pricing.locator('.ww-tier-grid');
    await expect(grid.locator('.ww-tier-card')).toHaveCount(2);
    await expect(grid).toContainText('Starter');
    await expect(grid).toContainText('Pro');
    // Only what the app still sells: the retired tier never reaches the grid.
    await expect(grid).not.toContainText('Legacy');

    const pro = grid.locator('.ww-tier-card', { hasText: 'Pro' });
    await expect(pro.locator('.ww-tier-price-amount')).toHaveText(money(PRO_MONTHLY));

    // The annual side of the toggle quotes the annual option, not a derived figure.
    await pricing.locator('.ww-apptier-billing-toggle .ww-toggle').click();
    await expect(pro.locator('.ww-tier-price-amount')).toHaveText(money(PRO_ANNUAL));
  });

  test('pricing view groups the packs and prices each one', async ({ page }) => {
    await mockApi(page);
    await page.goto(harnessUrl('pricing'));

    const packs = page.locator('[data-ww-view="pricing"] .ww-regsub-packs');
    await expect(packs).toBeVisible();

    // The page's own headings, matched on each pack's catalog category.
    await expect(packs.locator('[data-ww-group="content"] .ww-regsub-pack-group-title')).toHaveText('Content');
    await expect(packs.locator('[data-ww-group="analytics"]')).toHaveCount(0); // no pack in that category
    // A pack no heading claims lands in the trailing group rather than vanishing.
    await expect(packs.locator('[data-ww-group="more"]')).toContainText('Automation Pack');

    await expect(packs.locator('[data-ww-pack="pack-docs"] .ww-pack-card-price')).toContainText(money(DOCS_PACK));
    await expect(packs.locator('[data-ww-pack="pack-ai"] .ww-pack-card-price')).toContainText(money(AI_PACK));

    // Multi-select: ticking packs arms one call to action for the whole basket.
    await packs.locator('[data-ww-pack="pack-docs"]').click();
    await packs.locator('[data-ww-pack="pack-ai"]').click();
    const summary = packs.locator('.ww-regsub-summary button');
    await expect(summary).toBeEnabled();
    await summary.click();

    // The harness logs what the host would navigate with.
    await expect(page.locator('.status-card', { hasText: 'Event Log' })).toContainText('onSelect');
  });

  test('signup view offers the form and the optional token card when registration is open', async ({ page }) => {
    await mockApi(page, { allowOpenRegistration: true, allowTokenRegistration: true });
    await page.goto(harnessUrl('signup'));

    const signup = page.locator('[data-ww-view="signup"]');
    await expect(signup).toBeVisible();
    await expect(signup.locator('[data-ww-step="register"]')).toBeVisible();
    await expect(signup.locator('input[type="email"], input[name="email"]').first()).toBeVisible();
    await expect(signup).toContainText('Have a Registration Token?');
  });

  test('signup view shows the closed notice when the app takes no registrations', async ({ page }) => {
    await mockApi(page, { allowOpenRegistration: false, allowTokenRegistration: false });
    await page.goto(harnessUrl('signup'));

    const signup = page.locator('[data-ww-view="signup"]');
    await expect(signup.locator('[data-ww-step="closed"]')).toBeVisible();
    await expect(signup.locator('.ww-regsub-closed-message')).toHaveText('Registration is closed');
    await expect(signup.locator('input[type="password"]')).toHaveCount(0);
  });

  test('each view carries its own data-ww-view, and manage names its plan-change step', async ({ page }) => {
    await mockApi(page);

    await page.goto(harnessUrl('pricing'));
    await expect(page.locator('[data-ww-view="pricing"]')).toHaveCount(1);

    await page.goto(harnessUrl('signup'));
    await expect(page.locator('[data-ww-view="signup"]')).toHaveCount(1);

    await page.goto(harnessUrl('manage'));
    const manage = page.locator('[data-ww-view="manage"]');
    await expect(manage).toHaveCount(1);
    await expect(manage).toHaveAttribute('data-ww-step', 'idle');

    // The invite preset is the signup view with the token path forced.
    await page.goto(harnessUrl('invite'));
    await expect(page.locator('[data-ww-view="signup"]')).toHaveCount(1);
  });
});
