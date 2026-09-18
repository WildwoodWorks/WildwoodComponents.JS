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
  it already covers; `tokenMode: 'required'` is invite redemption, so it skips the plan and the packs
  whatever the app's own flags say. `SELECTION_RESOLVED` is how the live catalog tells the machine
  what a signup link already chose (a plan it vetted, the app's default in a `skip` flow, and the
  packs it filtered): a resolved plan sets `planPreset`, which takes the plan step out of the flow
  while leaving `GO_TO 'plan'` as the way back to the grid. It is accepted only before the form is
  submitted, so a catalog reloading underneath cannot rewrite what is being bought.
  `alreadySignedInLatched` is set once at the first `INIT`, so a mid-flow login never re-triggers
  "you are already signed in". Step 2 is also a gate: nothing past the form runs until it has been
  submitted (`formSubmitted`), so a visitor who followed "change plan" out of an empty form and
  chose there is returned to the form with their new plan — never onward to a card form or an
  account creation with no details behind it.
- `packCheckoutMachine` — quote, one card when there is none on file, one purchase, then 3-D Secure
  walked one pack at a time. One pack failing leaves the rest of the basket alone. Retrying a failed
  card step drops the SetupIntent that attempt was holding, so the driver collects a fresh one rather
  than confirming the abandoned intent.
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
