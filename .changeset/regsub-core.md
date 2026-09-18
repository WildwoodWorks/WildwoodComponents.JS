---
"@wildwood/core": minor
---

Public catalog, signup-link parsing, lazy Stripe.js and the card-once pack checkout

The core SDK now carries everything a registration-and-subscription screen needs from the server.
`features/catalog.ts` is a pure, SSR-safe catalog model: `buildPublicCatalog` (currency from the
public tier/add-on responses, then a caller override, then USD; Active items only, in display
order), `resolvePriceOption`, `formatMoney` (via `Intl`, so a currency outside `CURRENCY_SYMBOLS`
renders properly; the currency's standard fraction digits, so a whole $79 stays `$79.00` exactly
as `formatPrice` gives it), `trialLabel`, `catalogToJsonLdOffers` (live prices only — an item with
no pricing, or a tier whose operator hid the price, is left out rather than published at zero),
`parseAddOnIdList`, `selectPacks` and `encode`/`decodeCatalogSelection` under the `tier`, `pricing`
and `addons` query keys. `parseSignupParams` reads those plus `token`, `invite` and `email` off a
signup link. Every price comes from the live catalog: nothing here persists or falls back to one.

`payment/stripe.ts` adds `getStripeInstance(publishableKey)` — lazy, cached per key, rejecting with
a `WildwoodError` outside a browser — plus `resetStripeInstanceCache` and a minimal `StripeLike`
interface, so UI code and tests never import Stripe's own types.

`AppTierService` gains the new server endpoints, each returning a structured result instead of
throwing: `trialEligibility`, `quoteAddOnCheckout`, `createCheckoutPaymentMethod`, `checkoutAddOns`,
`completeAddOnCheckout` (buy any number of packs against one card, with per-pack trial, 3-D Secure
and failure outcomes), `completeTierChange` for a plan change parked on 3-D Secure,
`subscribeToAddOnDetailed`, `cancelAddOnDetailed` and `reactivateAddOn`. Refusals arrive as
`AppTierActionError`: the server's own `errorCode` when it sent one, `NotSupported` for a 404 that
carries none (a server older than this SDK), `RequestFailed` otherwise. `changeTier` takes an
options form that posts `SupportsPaymentAction`; its positional form is unchanged.

**Deprecations.** `subscribeToAddOn` and `cancelAddOnSubscription` answer a bare `boolean`, which
cannot say why the server refused: use `subscribeToAddOnDetailed` and `cancelAddOnDetailed`.
`formatPrice` is deprecated in favour of `formatMoney`: it reads a seven-entry symbol table and
falls back to `'$'`, so an app billing in CHF or SEK is quoted in dollars, and `formatMoney`'s
output is byte-identical for every currency that table does carry. All three still work and are
still exported; nothing has been removed.

Types follow: `currency` on `AppTierModel`/`AppTierAddOnModel`, `userId`, `appId`,
`appTierAddOnPricingId`, `paymentTransactionId` and `userPaymentProviderId` on
`UserAddOnSubscriptionModel` (a row with no payment transaction was granted, not sold), the
3-D Secure fields on `AppTierChangeResultModel`, and the checkout/trial models and error-code
unions. The emitter gains `entitlementsChanged` (`appId` + reason), and `InitiatePaymentRequest`
gains `billingAddress`, sent as `BillingAddress` — the server's `InitiatePaymentRequest` has no
billing-address property yet, so it needs one before the value is bound rather than ignored.

The README documents the catalog helpers, `parseSignupParams`, `getStripeInstance`, the new
`AppTierService` methods with the structured-error rule (`NotSupported` on a bare 404 means "this
deployment does not have that endpoint yet"), the `entitlementsChanged` event and the
`billingAddress` follow-up.
