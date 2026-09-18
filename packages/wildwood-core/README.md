# @wildwood/core

[![npm version](https://img.shields.io/npm/v/@wildwood/core.svg)](https://www.npmjs.com/package/@wildwood/core)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@wildwood/core)](https://bundlephobia.com/package/@wildwood/core)

Pure TypeScript SDK for the Wildwood API platform. Framework-agnostic — works in browsers and Node.js.

## Installation

```bash
npm install @wildwood/core
# or
pnpm add @wildwood/core
```

## Quick Start

```typescript
import { createWildwoodClient } from '@wildwood/core';

const client = createWildwoodClient({
  baseUrl: 'https://your-api.example.com',
  appId: 'your-app-id',
  enableAutoTokenRefresh: true,
  sessionExpirationMinutes: 60,
});

// Authenticate
const response = await client.auth.login({
  email: 'user@example.com',
  password: 'password',
  appId: 'your-app-id',
  appVersion: '1.0.0',
  platform: 'web',
  deviceInfo: navigator.userAgent,
});

// Use services
const sessions = await client.ai.getSessions();
const threads = await client.messaging.getThreads();
const theme = client.theme.theme;
```

## Services

| Service | Description |
|---------|-------------|
| `client.auth` | Login, register, OAuth, passkeys, password reset, 2FA verification |
| `client.session` | Token storage, auto-refresh at 80% lifetime, sliding expiration |
| `client.ai` | Chat sessions, messages, TTS/STT, flow definitions, flow execution |
| `client.messaging` | Threads, messages, reactions, typing indicators, attachments, SignalR |
| `client.payment` | Payment processing, saved methods, subscriptions, provider config |
| `client.notifications` | Client-side toast notification queue |
| `client.twoFactor` | 2FA setup, recovery codes, trusted devices |
| `client.disclaimer` | Pending disclaimers, acceptance |
| `client.appTier` | Tier browsing, feature gating, limits, add-ons |
| `client.theme` | Theme persistence, CSS variable application |
| `client.events` | Typed event emitter (authChanged, sessionExpired, themeChanged) |

## Storage Adapters

```typescript
// Browser (default)
const client = createWildwoodClient({ ...config, storage: 'localStorage' });

// Node.js / testing
const client = createWildwoodClient({ ...config, storage: 'memory' });

// Custom adapter
const client = createWildwoodClient({
  ...config,
  storage: {
    getItem: async (key) => myStore.get(key),
    setItem: async (key, value) => myStore.set(key, value),
    removeItem: async (key) => myStore.delete(key),
  },
});
```

## Events

```typescript
client.events.on('authChanged', (isAuthenticated) => {
  console.log('Auth state:', isAuthenticated);
});

client.events.on('sessionExpired', () => {
  // Redirect to login
});

client.events.on('tokenRefreshed', () => {
  // Token was auto-refreshed
});

client.events.on('entitlementsChanged', ({ appId, reason }) => {
  // The user signed up, changed plan, bought or cancelled a pack, reactivated one, or an admin
  // granted something: what they are entitled to just moved. The full union is
  //   'signup' | 'tierChange' | 'addOn' | 'cancel' | 'reactivate' | 'manual'
  // and 'signup' is the first one a host sees, right after a customer finishes the signup flow.
  // Entitlements sit behind several caches, so this says "re-read", not "the new state is live".
});
```

## Public Catalog

`features/catalog.ts` is the price list a pricing, signup or upgrade screen renders from. Every
function in it is pure and SSR-safe — nothing touches `window` or `document`, and nothing persists,
caches or falls back to a price. Prices are only ever read off the live public responses you pass in.

```typescript
import { buildPublicCatalog, resolvePriceOption, formatMoney } from '@wildwood/core';

const [tiers, addOns] = await Promise.all([
  client.appTier.getPublicTiers(appId),
  client.appTier.getPublicAddOns(appId),
]);
const catalog = buildPublicCatalog({ appId, tiers, addOns });

const plan = catalog.tiers[0];
const pricing = resolvePriceOption(plan, { billing: 'annual' });
const label = pricing ? formatMoney(pricing.price, catalog.currency) : 'Contact us';
```

| Export | Description |
|--------|-------------|
| `buildPublicCatalog(input)` | `{ appId, currency, tiers, addOns, fetchedAt }`. `Active` items only, in `displayOrder`. Currency is the first one the server sent, then `currencyOverride`, then USD. |
| `resolvePriceOption(item, query)` | The option named by `pricingId`, else one matching `billing` ("Yearly"/"Annual"/"Annually" are one cycle), else the item's default, else the first. `undefined` when the item sells no pricing. |
| `formatMoney(amount, currency, locale?)` | Via `Intl`, so a currency outside the built-in symbol table renders properly. Fixed `en-US` locale by default so a server render and its hydration agree. |
| `trialLabel(days)` | `"14-day free trial"`, or `''` when the pricing starts no trial. |
| `catalogToJsonLdOffers(catalog, { url })` | schema.org `Offer`s for everything with a live price. An unpriced item, and a tier whose operator hid the price, are left out rather than published at zero. |
| `parseAddOnIdList(value, catalog?)` | Comma- or whitespace-separated ids, trimmed, de-duplicated, capped at `MAX_ADDON_SELECTION` (25). With a catalog, ids the app does not sell are dropped. |
| `selectPacks(catalog, addOnIds)` | The named packs, in catalog order rather than the order they were asked for. |
| `encodeCatalogSelection(selection)` | A query string (no leading `?`) under `CATALOG_QUERY_KEYS`: `tier`, `pricing`, `addons`. |
| `decodeCatalogSelection(params, catalog?)` | The selection back out of a URL, query string or `URLSearchParams`. |

`parseSignupParams(search, catalog?)` reads a whole signup link — the selection above plus `token`,
`invite` and `email`. You supply the query string (from a router, a request URL or
`window.location.search`), so nothing reads the browser's location for you:

```typescript
const { tierId, pricingId, addOnIds, token, invite, email } = parseSignupParams(location.search);
```

## Stripe.js

```typescript
import { getStripeInstance } from '@wildwood/core';

const stripe = await getStripeInstance(publishableKey); // lazy, cached per key
```

Stripe.js is loaded on demand and the instance cached per publishable key; outside a browser the
promise rejects with a `WildwoodError`. `StripeLike` (with `StripeElementsLike`,
`StripeElementLike`, `StripeConfirmResult`) is a minimal structural interface, so UI code and tests
never have to import Stripe's own types. `resetStripeInstanceCache()` is for tests.

## Subscriptions, Checkout and 3-D Secure

`client.appTier` carries the endpoints a registration or upgrade screen needs. These return a
**structured result instead of throwing** for anything the server refused, so a caller can say why:

| Method | Description |
|--------|-------------|
| `trialEligibility(appId)` | Whether this account may still start a trial — `tierTrialEligible`, plus the same answer per pack keyed by add-on id. |
| `quoteAddOnCheckout(appId, items)` | What a pack basket costs, and whether a card is already on file. |
| `createCheckoutPaymentMethod(appId, providerId)` | A SetupIntent for collecting one card for the whole basket. |
| `checkoutAddOns(appId, request)` | Buy any number of packs against one card, with per-pack trial and outcome. |
| `completeAddOnCheckout(appId, paymentTransactionId)` | Finish a pack whose card needed 3-D Secure. |
| `changeTier(appId, { newTierId, newPricingId, immediate, paymentTransactionId, supportsPaymentAction })` | The options form. `supportsPaymentAction` posts `SupportsPaymentAction`, so a change whose proration needs 3-D Secure is parked for you to confirm instead of being refused. The positional form is unchanged. |
| `completeTierChange(appId, pendingChangeId)` | Finish a plan change parked on 3-D Secure. Answers `processing` while the server is still applying it. |
| `subscribeToAddOnDetailed(appId, addOnId, pricingId?, paymentTransactionId?)` | Subscribe to one pack, with the server's reason when it is refused. |
| `cancelAddOnDetailed(subscriptionId, immediate?)` | Cancel one pack: scheduled for the end of the paid period unless `immediate`. |
| `reactivateAddOn(subscriptionId)` | Take back a scheduled pack cancellation. |

A refusal arrives as `AppTierActionError`, whose `code` is the server's own `errorCode` when it sent
one, `NotSupported` for a bare 404 with no code (a server older than this SDK — treat it as "this
deployment does not have that endpoint yet", not as a failure to report to the user), and
`RequestFailed` otherwise.

`subscribeToAddOn` and `cancelAddOnSubscription` are **deprecated**: they answer a bare `boolean`,
which cannot say why something was refused. Use the `*Detailed` variants.

`InitiatePaymentRequest` gained `billingAddress`, sent as `BillingAddress`. Note that the server's
own `InitiatePaymentRequest` has no billing-address property yet, so the value is accepted and
ignored until it does — collect it for the processor's own forms, but do not depend on the platform
storing it.

## Optional Dependencies

- `@microsoft/signalr` — Required only if using real-time messaging (`client.messaging`)

## License

MIT
