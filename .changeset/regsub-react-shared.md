---
"@wildwood/react-shared": minor
---

The registration-and-subscription logic layer, and `useSubscriptionAdmin` stops hiding refusals

`resolveSignupRegistrationMode` replaces the copy of `registrationModeFor` that each host site
carried: open registration plus the optional token card, open only, token required, or closed, with
an open-sign-up fallback while the settings are unknown (`source` says which of the three answered).
`tokenMode: 'required'` is invite redemption and overrides the configuration in every case,
including a closed one, because the server validates the invite token itself.

`useRegistrationMode(appId, { tokenMode, enabled })` reads the app's live authentication
configuration on EVERY mount — deliberately uncached, so an operator who has just closed
registration sees it take effect on the next visit — and ignores a response that lands after an
unmount or an appId change.

`usePublicCatalog(appId, { currency, initialCatalog, enabled })` loads the public tiers and packs in
parallel and builds a `PublicCatalog`. A module-level cache keyed by appId with a 60 s TTL means N
mounted instances make ONE pair of requests; a failure is never cached; `initialCatalog` is used on
the first render and seeded into the cache, so an SSR snapshot paints real prices with no loading
flash. `invalidatePublicCatalog(appId?)` drops one or every entry and refreshes mounted instances,
`seedPublicCatalog` and `clearPublicCatalogCache` round out the module. Nothing touches `window`.

`useRegistrationSubscription` composes the two and adds `notifyEntitlementsChanged(reason)`, which
clears the shared feature cache and emits `entitlementsChanged`. It does NOT invalidate the catalog:
buying something does not change the price list.

Three pure reducers in `registrationSubscription/` carry the flows, free of React and of the client:

- `signupMachine` — `loading` → `closed` | `register` → `token` → `plan` → `packs` → `payment` →
  `creating` → `disclaimers` → `packCheckout` → `done`, in the pay-first order (the plan's card is
  taken before the account exists). A token grant skips the plan and the payment and drops the packs
  it already covers; `tokenMode: 'required'` skips the packs too. `alreadySignedInLatched` is set
  once at the first `INIT`, so a mid-flow login never re-triggers "you are already signed in".
- `packCheckoutMachine` — quote, one card when there is none on file, one purchase, then 3-D Secure
  walked one pack at a time. One pack failing leaves the rest of the basket alone.
- `planChangeMachine` — preview, confirm, optional up-front payment, change, then the 3-D Secure
  park-and-complete path; `processing` is retried rather than reported as a failure.

Every async step is issued a `StepToken` (`issueStepToken`), and a result carrying any other token
is ignored and returns the same state object — so React StrictMode's doubled effects and a payment
callback that fires twice are both no-ops.

**Behaviour change in `useSubscriptionAdmin`.** The mutations that answer a bare `boolean` now set
`error` when the answer is `false` ("The request was refused: could not subscribe to the pack.") —
until now a refused pack subscribe, cancel, feature override or usage-limit change was
indistinguishable from one that worked. They still return the boolean. Every entitlement-changing
mutation also emits `entitlementsChanged` on the client's emitter with the reason that fits
(`tierChange`, `addOn`, `cancel`, `reactivate` or `manual`) alongside the `invalidateFeatures()` it
already did. New members: `changeTierWithOptions`, `completeTierChange`, `subscribeToAddOnDetailed`,
`cancelAddOnDetailed`, `reactivateAddOn`, `getTrialEligibility` and `getPublicAddOns` — the detailed
ones put the server's own refusal (or its error code) in `error` and return the result.
