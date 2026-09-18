// @vitest-environment node
/**
 * The pricing view has to survive a server render: a prerendered landing page is the main reason
 * it exists. There is no window here at all, so anything the module graph or the render touches on
 * one fails this file rather than a customer's build.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { buildPublicCatalog, createWildwoodClient, formatMoney, type AppTierModel } from '@wildwood/core';
import { WildwoodContext } from '../provider/WildwoodContext.js';
import { RegistrationSubscriptionPricing } from '../index.js';

// `react-dom` is not a dependency of this package — only @testing-library/react brings it in — so
// under pnpm's isolated node_modules a plain `import 'react-dom/server'` does not resolve from here.
// Borrowing that install beats adding a dependency to ship one test.
const nodeRequire = createRequire(import.meta.url);
const serverEntry = nodeRequire.resolve('react-dom/server', {
  paths: [nodeRequire.resolve('@testing-library/react')],
});
const { renderToString } = (await import(pathToFileURL(serverEntry).href)) as typeof import('react-dom/server');

const PRO_PRICE = 79;

const proTier = {
  id: 'tier-pro',
  appId: 'app-ssr',
  name: 'Pro',
  description: 'Everything a team needs.',
  status: 'Active',
  displayOrder: 1,
  isFreeTier: false,
  isDefault: true,
  showPrice: true,
  showSubscribeButton: true,
  showContactButton: false,
  currency: 'USD',
  pricingOptions: [
    { id: 'price-pro-monthly', price: PRO_PRICE, billingFrequency: 'Monthly', isDefault: true, displayOrder: 1 },
  ],
  features: [],
  limits: [],
} as unknown as AppTierModel;

describe('the pricing view on a server', () => {
  it('imports the package without a window', async () => {
    expect(typeof globalThis.window).toBe('undefined');
    await expect(import('../index.js')).resolves.toBeDefined();
  });

  it('renders the snapshot prices into the HTML, with no loading state', () => {
    const client = createWildwoodClient({ baseUrl: 'https://test.example.com', appId: 'app-ssr', storage: 'memory' });
    const catalog = buildPublicCatalog({ appId: 'app-ssr', tiers: [proTier], addOns: [] });

    const html = renderToString(
      <WildwoodContext.Provider value={client}>
        <RegistrationSubscriptionPricing
          appId="app-ssr"
          initialCatalog={catalog}
          includeJsonLd
          onSelect={() => undefined}
        />
      </WildwoodContext.Provider>,
    );

    expect(html).toContain('data-ww-view="pricing"');
    expect(html).toContain(formatMoney(PRO_PRICE, 'USD'));
    // The snapshot renders on the first pass, so the placeholder never appears.
    expect(html).not.toContain('Loading');
    expect(html).not.toContain('ww-pricing-skeleton');
    // The offers are in the prerendered HTML too, which is the point of prerendering a price list.
    expect(html).toContain('application/ld+json');
    expect(html).toContain(PRO_PRICE.toFixed(2));
  });
});
