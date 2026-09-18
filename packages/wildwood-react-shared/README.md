# @wildwood/react-shared

Shared React logic for `@wildwood/react` and `@wildwood/react-native`. Hooks, pure state machines
and small resolvers — **no DOM and no components**, so the same code runs in a browser, in React
Native and during a server render. A React Native type-check in CI keeps it that way.

You rarely install this directly: it is a peer dependency of `@wildwood/react` and
`@wildwood/react-native`, and most of its hooks are re-exported from those packages. Import from
here when you want a hook the framework package does not re-export, or when you are writing a
renderer of your own.

```bash
pnpm add @wildwood/core @wildwood/react-shared
```

Everything expects a `WildwoodClient` in context — `WildwoodProvider` from the framework package
provides it, and `useWildwood()` reads it.

## Hooks

The full set covers auth, AI, messaging, payments, notifications, theming, features, documents,
usage and feedback. See the `@wildwood/react` README for the table; the entries below are the
registration-and-subscription layer.

### `useRegistrationMode(appId?, { tokenMode, enabled })`

Reads the app's live authentication configuration and resolves it into the paths a signup screen may
offer: `{ mode, config, loading, error, reload }`.

Deliberately **not** cached across mounts, unlike `useFeatures` and `usePublicCatalog`: an operator
who has just turned open registration off expects the next visitor to see the closed screen, not one
a module cache kept alive. One small unauthenticated GET per mount buys that. A response that lands
after an unmount or an `appId` change is dropped.

While the settings are loading, and when they cannot be read, `mode` is the open-sign-up fallback
with `source: 'fallback'` — pair it with `loading` so a view can wait rather than flash a path the
server may refuse.

### `resolveSignupRegistrationMode(config, { tokenMode })`

The pure decision behind that hook, and the replacement for the copy of `registrationModeFor` each
host site used to carry:

| `allowOpenRegistration` | `allowTokenRegistration` | Result |
|-------------------------|--------------------------|--------|
| true | true | open sign-up plus the optional "Have a registration token?" card |
| true | false | open sign-up, no token card |
| false | true | the token step is required |
| false | false | `closed: true` |

`config` of `null` (not read yet, or unreadable) gives open sign-up plus the optional token card;
`source` says which of the three answered (`'config'`, `'fallback'`, `'tokenMode'`). The server
still enforces its own settings, so the fallback can only offer a path that is refused with a clear
message, never grant one the server would not.

`tokenMode: 'required'` is invite redemption and **overrides the configuration in every case**,
a closed one included, because the server validates the invite token itself.

### `usePublicCatalog(appId?, { currency, initialCatalog, enabled })`

Loads the app's public tiers and packs in parallel and builds a `PublicCatalog`:
`{ catalog, loading, error, refresh }`.

- A module-level cache keyed by `appId` with a 60 s TTL and one in-flight promise, so N mounted
  instances make **one** pair of requests.
- A failure is never cached: a transient error must not leave the app looking like it sells nothing
  for a minute.
- `initialCatalog` is returned on the first render and seeded into the cache, so an SSR snapshot
  paints real prices with no loading flash.
- A background refresh does not blank prices that are already on screen.
- Nothing touches `window`.

`invalidatePublicCatalog(appId?)` drops one entry (or every entry) **and** refreshes every mounted
hook — it is for an operator changing the price list. Buying something does not change what an app
sells, so the purchase paths deliberately do not call it. `seedPublicCatalog(appId, catalog)` fills
the cache without fetching, and `clearPublicCatalogCache()` empties it without refreshing anyone.

### `useRegistrationSubscription({ appId, currency, initialCatalog, tokenMode, enabled })`

Composes the two above (`catalog`, `catalogLoading`, `catalogError`, `refreshCatalog`, `mode`,
`modeLoading`, `modeError`, `client`) and adds `notifyEntitlementsChanged(reason)`, which clears the
shared feature cache, refreshes every mounted gate, and emits `entitlementsChanged` on the client's
emitter. It does **not** invalidate the catalog: buying something does not change the price list.

`reason` is `EntitlementsChangedReason`, the whole union being
`'signup' | 'tierChange' | 'addOn' | 'cancel' | 'reactivate' | 'manual'`. A listener switching on it
needs all six: the signup flow emits `'signup'` when a new account's plan and packs land, which is
the first entitlements event a host ever sees.

### `useSubscriptionAdmin()`

Subscription, tiers, packs, usage and overrides for an admin or self-service surface.

**Behaviour change.** The mutations that answer a bare `boolean` now set `error` when the answer is
`false` ("The request was refused: could not subscribe to the pack.") — until now a refused pack
subscribe, cancel, feature override or usage-limit change was indistinguishable from one that
worked. They still return the boolean, so existing call sites keep compiling. Every
entitlement-changing mutation also emits `entitlementsChanged` with the reason that fits — of the
six-member union, these mutations emit `tierChange`, `addOn`, `cancel`, `reactivate` or `manual`
(`signup` comes from the signup flow) — alongside the `invalidateFeatures()` it already did.

New members: `changeTierWithOptions`, `completeTierChange`, `subscribeToAddOnDetailed`,
`cancelAddOnDetailed`, `reactivateAddOn`, `getTrialEligibility` and `getPublicAddOns`. The detailed
ones put the server's own refusal (or its error code) in `error` and return the result, instead of
answering `false` and leaving the caller to guess why.

## The registration-and-subscription machines

Three pure reducers carry the flows. They are plain `(state, event) => state` functions with no
React, no client and no DOM — a hook drives them and does the I/O, which is what makes the order of
a signup or a plan change testable without a renderer or a server.

| Machine | What it sequences |
|---------|-------------------|
| `signupTransition` / `initialSignupState` | `loading` → `closed` \| `register` → `token` → `plan` → `packs` → `payment` → `creating` → `disclaimers` → `packCheckout` → `done` \| `failed` |
| `packCheckoutTransition` / `initialPackCheckoutState` | Quote → one card when none is on file → one purchase → 3-D Secure, walked one pack at a time |
| `planChangeTransition` / `initialPlanChangeState` | Preview → confirm → optional up-front payment → change → 3-D Secure park-and-complete |

Notes that matter when driving them:

- **Signup is pay-first**: the plan's card is taken before the account exists. A token grant skips
  the plan and the payment and drops the packs it already covers; `tokenMode: 'required'` skips the
  plan and the packs whatever the app's flags say. `SELECTION_RESOLVED` is how the live catalog
  tells the machine what a signup link already chose, and is accepted only before the form is
  submitted, so a catalog reloading underneath cannot rewrite what is being bought. Step 2 is also
  a gate: nothing past the form runs until it has been submitted.
- **Pack checkout is one card, many packs**: one pack failing leaves the rest of the basket alone,
  and retrying a failed card step drops the SetupIntent that attempt was holding.
- **Plan change treats `processing` as a "not yet"**: it is retried on a bounded budget (see
  `MAX_PLAN_CHANGE_COMPLETE_ATTEMPTS`) that a manual `RETRY` starts over, rather than reported as a
  failure.

### Step tokens

Every async step is issued a `StepToken` with `issueStepToken()`, and a result carrying any other
token is ignored — the reducer returns the *same state object*, so React can bail out of the render.
That is what makes StrictMode's doubled effects and a payment SDK that calls back twice both no-ops.
`isCurrentStep(state, token)` is the check the reducers use.

## Other shared exports

- `ACCESS_GRANTING_STATUSES` / `grantsAccess(status)` — the one rule for what "subscribed" means
  (`Active`, `Trialing`, `PendingCancellation`), shared by the web and native panels.
- `STATUS_LABEL`, `CANCELLABLE_STATUSES`, `pendingCancellationNotice` — subscription status display.
- `resolveRegistrationAccess`, `useAuthenticationLogic`, `useTwoFactorLogic` — the DOM-free halves of
  the authentication components.
- `streamOrchestratedChat` and the SSE helpers behind `useAI`.

## License

MIT
