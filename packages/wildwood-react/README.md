# @wildwood/react

[![npm version](https://img.shields.io/npm/v/@wildwood/react.svg)](https://www.npmjs.com/package/@wildwood/react)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@wildwood/react)](https://bundlephobia.com/package/@wildwood/react)

React hooks and components for the Wildwood API platform. Thin UI layer over `@wildwood/core`.

## Installation

```bash
npm install @wildwood/core @wildwood/react
# or
pnpm add @wildwood/core @wildwood/react
```

## Quick Start

```tsx
import { WildwoodProvider, useAuth, AuthenticationComponent } from '@wildwood/react';
import '@wildwood/react/styles'; // Optional: Wildwood CSS themes

function App() {
  return (
    <WildwoodProvider config={{
      baseUrl: 'https://your-api.example.com',
      appId: 'your-app-id',
      enableAutoTokenRefresh: true,
    }}>
      <MyApp />
    </WildwoodProvider>
  );
}

function MyApp() {
  const { isAuthenticated, user, logout } = useAuth();

  if (!isAuthenticated) {
    return <AuthenticationComponent onAuthenticationSuccess={() => {}} />;
  }

  return (
    <div>
      <p>Welcome, {user?.firstName}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

## Hooks

| Hook | Description |
|------|-------------|
| `useAuth()` | Authentication state, login, register, logout |
| `useSession()` | Token state, auto-refresh lifecycle |
| `useAI()` | AI chat sessions, messages, TTS/STT |
| `useMessaging()` | Threads, messages, reactions, SignalR |
| `usePayment()` | Payment processing, saved methods |
| `useNotifications()` | Toast notification queue |
| `useTheme()` | Theme switching and persistence |
| `useTwoFactor()` | 2FA settings and credentials |
| `useCaptcha()` | CAPTCHA script lifecycle |
| `useDisclaimer()` | Disclaimer fetch and acceptance |
| `useAppTier()` | Tier browsing, feature gating |
| `useSubscriptionAdmin()` | Subscription, tiers, packs, usage and overrides for an admin surface |
| `usePublicCatalog()` | The app's public tiers and packs as one `PublicCatalog` (shared cache, SSR-seedable) |
| `useRegistrationMode()` | The app's live registration settings, resolved into what a signup screen may offer |
| `useRegistrationSubscription()` | The two reads above plus `notifyEntitlementsChanged` |
| `useFeedback()` | Feedback widget config, submit, duplicate-check, vote |
| `usePlatformDetection()` | Browser/OS/device detection |
| `useWildwood()` | Direct access to WildwoodClient |
| `useWildwoodComponent()` | Base loading/error state pattern |

## Components

- `RegistrationAndSubscriptionComponent` — Pricing, signup and subscription management in one
  component, picked with `view="pricing" | "signup" | "manage"`. The three views are also exported
  on their own as `RegistrationSubscriptionPricing`, `RegistrationSubscriptionSignup` and
  `RegistrationSubscriptionManage`, so a landing page can import the pricing view without dragging
  the admin surfaces along. See [Registration & Subscription](#registration--subscription).
- `AuthenticationComponent` — Login/register with OAuth, passkeys, 2FA
- `AIChatComponent` — Chat UI with sessions, messages, TTS
- `AIProxyComponent` — Direct AI model interaction
- `SecureMessagingComponent` — Threads, messages, reactions, typing
- `PaymentComponent` — Payment method selection and processing
- `PaymentFormComponent` — Payment form with validation
- `NotificationComponent` — Notification list
- `NotificationToastComponent` — Animated toast popups
- `TwoFactorSettingsComponent` — 2FA setup wizard
- `TokenRegistrationComponent` — Token-based registration (the signup view renders it for the form
  and the registration-token card)
- `SubscriptionAdminComponent` — Subscription, plans, features, packs, usage and overrides
- `UsageDashboardComponent` / `OverageSummaryComponent` — Usage against the plan's limits
- `DisclaimerComponent` — Disclaimer display and acceptance
- `FeedbackComponent` — Floating feedback widget (screenshot, attachments, duplicate detection)

Deprecated, and kept working — nothing has been removed:

| Deprecated | Use instead |
|------------|-------------|
| `PricingDisplayComponent` | `RegistrationAndSubscriptionComponent view="pricing"` |
| `SignupWithSubscriptionComponent` | `RegistrationAndSubscriptionComponent view="signup"` |
| `AppTierComponent` | `RegistrationAndSubscriptionComponent view="manage"` |

`AppTierComponent` also has a known payment bug: its payment step passes no `pricingModelId` to
`PaymentComponent`, so a paid plan is taken as a one-time charge instead of starting the plan's
subscription and its trial. The manage view sends the pricing model, so use it for anything priced.

### Screenshots and Content-Security-Policy

`FeedbackComponent`'s screenshot capture uses [html2canvas](https://html2canvas.hertzen.com/),
which ships as a dependency of this package and is loaded with a dynamic `import()`. Your bundler
therefore code-splits it and serves it from your own origin — so it works under a strict
`script-src 'self'` policy, and applications that never render the widget never download it.

Two escape hatches, in precedence order, if you need the library to come from somewhere else:

```js
window.html2canvas = myCopy;                              // pre-register it; nothing is fetched
window.__WW_HTML2CANVAS_SRC__ = '/vendor/html2canvas.js'; // or name a URL to load it from
```

Consumers loading this SDK from a CDN, with no bundler to resolve the dependency, fall back to a
public CDN copy — which a strict CSP will refuse. Set one of the above in that case.

If html2canvas cannot be loaded at all, capture falls back to the browser's Screen Capture API,
which asks the user for a screen-share permission. That is a last resort, never the normal path.

## Registration & Subscription

`RegistrationAndSubscriptionComponent` is one component for everything a customer does with money:
the price list, signing up and buying, and managing what they bought. `view` picks the surface and
with it the rest of the props.

```tsx
import { RegistrationAndSubscriptionComponent } from '@wildwood/react';

<RegistrationAndSubscriptionComponent view="pricing" onSelect={goToSignup} />
<RegistrationAndSubscriptionComponent view="signup" onSignupComplete={welcome} />
<RegistrationAndSubscriptionComponent view="manage" onEntitlementsChanged={refreshGates} />
```

It is a switch and nothing more — the views are separate modules with no shared runtime state, so
`RegistrationSubscriptionPricing`, `RegistrationSubscriptionSignup` and
`RegistrationSubscriptionManage` can be imported directly instead, with the same props minus `view`.
There is no provider of its own: like every other component here, it reads the client out of
`WildwoodProvider`.

Also exported: `ClosedNotice` (the "registration is closed" panel, for a host that wants to say so
without mounting the signup flow), `PaymentModal` (the card modal the manage view brings),
`usePlanChangeFlow`, and `DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS` /
`formatRegistrationSubscriptionLabel` for the copy.

### Props every view shares

| Prop | Description |
|------|-------------|
| `appId` | The app to read the catalog and settings of. Defaults to the client's configured app. |
| `currency` | Overrides the currency the server quotes the catalog in. Rarely needed. |
| `className` | Appended to the component's own root class. |
| `labels` | Overrides for any of the component's strings; unset keys keep the shipped copy. |
| `contactUrl` | Where "contact us" and enterprise plans point. |
| `onError` | `({ code, message })` whenever the component gives up on something. Never throws into your render. |

### Pricing view

What the app sells, at the price the server is quoting right now.

```tsx
<RegistrationAndSubscriptionComponent
  view="pricing"
  showAddOns
  packSelection="multi"
  addOnGroups={groups}
  describeAddOn={(addOn) => copyFor(addOn)}
  contactUrl="/contact?plan=enterprise"
  includeJsonLd={{ url: 'https://example.com/pricing' }}
  onSelect={({ tierId, pricingId, billing, addOnIds }) =>
    navigate(`/signup?${encodeCatalogSelection({ tierId, pricingId, addOnIds })}`)
  }
/>
```

- **Content** — `showPlans` (default true), `showAddOns` (default false), `offerFreeTierChoice`
  (default true; false hides every `isFreeTier` plan), `packSelection` (`'none'` gives each pack its
  own call to action, `'multi'` lets the visitor tick several and continue once; default `'none'`),
  `addOnGroups` (headings matched on each pack's catalog `category` — an empty group is dropped, and
  packs matching no group land in a trailing "More packs" group rather than vanishing),
  `describeAddOn` (host copy for one pack: `blurb`, `meter`, `icon`).
- **Display** — `showBillingToggle` (default true, and only rendered when some plan is actually
  priced by the year), `defaultBilling` (`'monthly'` | `'annual'`), `showFeatureComparison`,
  `showLimits`, `highlightTierId`, `loadingFallback`, `errorFallback`, `includeJsonLd`
  (`true`, or `{ url }` to set the offers' canonical URL).
- **Data** — `initialCatalog`, a `PublicCatalog` built during a server render.
- **`onSelect`** (required) — `{ tierId?, pricingId?, billing, addOnIds }`. A plan's call to action
  carries whatever packs are ticked, so one click can buy the whole basket; a pack-only selection
  carries no `tierId`. `addOnIds` is in catalog order and is empty rather than absent.

The plan grid is the platform's existing `TierCard` grid — same `.ww-tier-grid` markup, same
"Get Started" / "Subscribe" / "Switch to ..." CTAs — so a site swapping `PricingDisplayComponent`
for this keeps its locators.

### Signup view

The whole way in, in the order that keeps an account and its money consistent.

```tsx
<RegistrationAndSubscriptionComponent
  view="signup"
  preSelectedTierId={tierId}
  preSelectedPricingId={pricingId}
  preSelectedAddOnIds={addOnIds}
  registrationToken={token}
  packSelection="multi"
  onSignupComplete={({ userId, tier, packs }) => navigate('/welcome')}
  onAlreadySignedIn={() => navigate('/dashboard')}
  onEntitlementsChanged={refreshGates}
/>
```

- **Preselection** — `preSelectedTierId`, `preSelectedPricingId`, `preSelectedAddOnIds` (checked
  against the catalog and capped at 25), `registrationToken`, `prefillEmail`.
- **Flow** — `planSelection` (`'choose'` | `'skip'`; `'skip'` takes the app's default plan and
  leaves the plan step out), `packSelection` (`'multi'` | `'none'`, default `'none'`: `'none'` only
  removes the step where packs are picked — packs a link already chose are still bought),
  `tokenMode` (`'auto'` follows the app's settings, `'required'` is invite redemption),
  `requireBillingAddress`, `returnUrl` (carried, never navigated to), `initialCatalog`,
  `renderClosed` to replace the closed notice.
- **Callbacks** — `onSignupComplete(outcome)`, `onAlreadySignedIn`, `onCancel`,
  `onEntitlementsChanged(reason)`, `onError({ code, message })`.

`onEntitlementsChanged`'s `reason` is `EntitlementsChangedReason`, whose whole union is
`'signup' | 'tierChange' | 'addOn' | 'cancel' | 'reactivate' | 'manual'` — the same value the client
emits as `entitlementsChanged`. The signup view reports `'signup'`, so a host switching on the
reason has to handle it or it will drop the refresh that matters most: the one right after an
account is created.

**The order.** The app's live registration settings decide what the form offers (open sign-up, the
optional "Have a registration token?" card, a required token, or the closed notice). A registration
token is validated and what it grants is shown before anything is charged. The plan's card is taken
**before** the account exists — a declined card then leaves nothing behind, rather than an account
on a plan nobody paid for. Packs are bought **after** the login, as the user, so the card taken a
minute earlier is the saved card and nobody is asked for it twice. One pack failing never stops the
others.

**A token that carries a plan** renders "Your registration token includes" with the tier, packs and
features it grants, and skips the plan and payment steps: none of it reaches a checkout.
`tokenMode="required"` is invite redemption — the token is the only way in, there is no plan and no
pack step, and it overrides a closed configuration because the server validates the token itself.

**`onSignupComplete`** is called once the account exists and everything asked for has been granted or
reported, after the app's feature gates have been refreshed. Its `SignupOutcome`:

```ts
{
  userId: string;
  tier: { tierId: string; name: string; pricingId?: string } | null;
  packs: Array<{
    addOnId: string;
    name: string;
    status: 'trialing' | 'active' | 'failed' | 'granted';
    trialEnd?: string;
    errorMessage?: string;
  }>;
  tokenGrant?: { tierId: string; pricingId?: string; addOnIds: string[]; featureCodes: string[] };
}
```

`status: 'granted'` is a pack a registration token (or an admin) set up: there is a subscription row
but no payment transaction behind it, so nothing was charged for it.

Registration refusals arrive at `onError` with the server's own code (a 403 `RegistrationNotAllowed`,
say) as well as on screen, and "Try Again" resumes at the step that failed instead of registering the
same person twice.

### Manage view

What a customer already pays for, and every way of changing it.

```tsx
<RegistrationAndSubscriptionComponent
  view="manage"
  layout="stacked"
  sections={['subscription', 'plans', 'addOns', 'usage']}
  allowPackSelfService
  onMergeUsage={overlayOurOwnCounters}
  onEntitlementsChanged={refreshGates}
/>
```

- **Layout** — `layout` (`'tabs'`, one panel at a time, default; or `'stacked'`, all of them down the
  page), `sections` picks and orders `'subscription' | 'plans' | 'features' | 'addOns' | 'usage' |
  'overrides'`, `showStatusAboveTabs` keeps the subscription card above the tab bar.
- **Scope** — `isAdmin` (unlocks the overrides panel and usage editing), `userId` / `companyId`
  (whose subscription to manage; neither means the signed-in user's own), `allowCancel` (default
  true), `showAddOns` (default true), `allowPackSelfService` (offers "Add packs" and the
  component's own card-once checkout).
- **Callbacks** — `onMergeUsage(statuses, subscription)` to overlay your own real-time usage before
  the limits render, `onSubscriptionChanged`, `onEntitlementsChanged(reason)`, `onError`, and
  `onPaymentRequired` — optional and rarely wanted, because the view has its own card modal and
  uses it when this is left out. A host that passes one keeps full control, exactly as the older
  `SubscriptionAdminComponent` behaved.

A plan change goes preview → confirm (in every layout) → a card if one is needed → change → 3-D
Secure → completion. A prorated charge the bank wants to see is confirmed with the app's own Stripe
publishable key and the parked change is then completed by its `pendingChangeId`, retried while the
server answers `processing`. A pack is cancelled at the end of the period it is paid up to, after
being told so, and a scheduled cancellation can be taken back; a pack nobody paid for reads
"Included with your registration", shows no renewal date and offers no Reactivate.

### Dynamic pricing

Every price on every view comes off the live catalog or the account's own subscription. There is no
fallback price, no remembered price and no "from" price anywhere in the component:

- while the catalog loads, a placeholder with no numbers in it (replaceable with `loadingFallback`);
- when the catalog cannot be read, "Pricing is unavailable right now" and a Retry — never a stale
  figure (replaceable with `errorFallback`), reported to `onError` as `catalog_unavailable`;
- every catalog-driven amount — the plan grid, the packs, the signup order summary, the plan-change
  preview and the manage panels — is formatted with `formatMoney` from `@wildwood/core`: `Intl`, the
  currency's standard fraction digits, and a fixed `en-US` locale so a server render and its
  hydration agree. Because the symbol comes from `Intl`, a currency outside the SDK's small symbol
  table (CHF, SEK, ...) renders as itself rather than falling back to a dollar sign;
- `includeJsonLd` publishes the same live prices as schema.org offers, and leaves out an item with
  no pricing option and a tier whose operator turned `showPrice` off rather than publishing a zero.

One deliberate exception: `PaymentComponent`, which the signup and manage views mount to take a
card, formats the amount it is charging with `Intl` in **the visitor's own locale** (so a German
customer sees `79,00 $`, not `$79.00`). It is still `Intl`, so the currency is never mis-symbolled;
only the grouping and placement follow the browser.

The shared `TierCard` grid formats through `formatMoney` too, so the deprecated
`PricingDisplayComponent` and `AppTierComponent` get correct symbols in their plan cards as well.
What they still format the old way is what they render themselves: `AppTierComponent`'s confirm and
payment steps, and `SignupWithSubscriptionComponent`'s plan summary and order lines — which also
hard-code USD. Another reason to move to the views.

### Test hooks

The root of every view carries `data-ww-view="pricing" | "signup" | "manage"`. The signup view's step
container carries `data-ww-step`:
`loading | closed | register | token | plan | packs | payment | creating | disclaimers |
packCheckout | success | failed`. The manage view's root carries the plan change's step:
`idle | previewing | confirm | collectingPayment | changing | authenticating | completing | done |
failed`. Packs carry `data-ww-pack="<addOnId>"` and pack groups `data-ww-group="<groupId>"` (the
trailing catch-all group is `more`); in the manage view, `data-ww-section="<section>"` is on each
panel in the stacked layout and on each tab button in the tabbed one.

The copy and class locators the live sites' end-to-end suites already use are deliberately unchanged:
"Continue" / "Create Account" on the form, `.ww-tier-grid` with its "Get Started" / "Subscribe" /
"Switch to ..." CTAs, `PaymentComponent`'s own pay button and success panel, `.ww-signup-processing`
with "Something Went Wrong" / "Try Again" / "Start Over", `.ww-signup-disclaimers`, and the "You're
All Set!" panel with "Get Started".

`DisclaimerComponent`'s buttons additionally carry
`data-ww-disclaimer-action="accept" | "accept-all" | "retry"`, so a test can tell an Accept from the
retry the component renders when the pending list fails to load — they share a container, and only a
style class told them apart before.

### Playwright helpers (`@wildwood/react/testing`)

Rather than every host rediscovering the same scaffolding, the helpers that drive this component ship
with it:

```ts
import { waitForSignupStep, finishSignup, dismissConsentBanner } from '@wildwood/react/testing';

await page.goto('/signup');
await waitForSignupStep(page, 'register');
await fillRegistrationForm(page, user);
await submitRegistrationForm(page);
// Waits out processing, retries a transient failure, accepts whatever disclaimers the app has
// configured, then asserts the success panel before leaving it.
await finishSignup(page, { expectSuccessText: 'your 14-day free trial has started' });
```

Exports: `signupStep`, `waitForSignupStep`, `recordSignupSteps`, `manageStep`, `waitForManageStep`,
`waitForAnyManageStep`, `fillRegistrationForm`, `submitRegistrationForm`, `acceptDisclaimers`,
`dismissConsentBanner`, `finishSignup`.

`@playwright/test` is an **optional peer dependency** — only this entry point needs it.

Three things these encode that are easy to get wrong, and that only show up against a deployed
environment rather than a local stack:

- **The completion message is asserted inside `finishSignup`, not by the caller.** It renders only in
  the `success` step, the final click navigates away from it, and `disclaimers` can sit between
  payment and success — so a caller checking straight after the card sees the disclaimer instead.
  Every app with real terms configured hits this.
- **A refused acceptance looks like a dead button.** `disclaimeracceptance/accept` shares the API's
  per-IP auth rate limit with login and register, so a suite enrolling several users a minute from one
  address gets 429s while the button just sits there. `acceptDisclaimers` watches the response, backs
  off on 429, and names the real cause instead of blaming a disabled button.
- **Labels are host-configurable, so nothing here locates a button by its text.** The success CTA is
  `labels.getStarted`; the helpers use `data-ww-*` hooks, `type="submit"` and component class names.

### SSR and prerendering

Nothing in the component touches `window` or `document` at module scope or during render, so the
views render on the server. Pass `initialCatalog` and the first paint has real prices with no loading
flash: `usePublicCatalog` returns the snapshot synchronously and seeds it into the shared cache, so
sibling instances reuse it instead of refetching.

Build the snapshot with the pure helpers in `@wildwood/core` — at build time, in a server render, or
in a route loader:

```ts
import { buildPublicCatalog, createWildwoodClient } from '@wildwood/core';

const client = createWildwoodClient({ baseUrl, appId, storage: 'memory' });
const [tiers, addOns] = await Promise.all([
  client.appTier.getPublicTiers(appId),
  client.appTier.getPublicAddOns(appId),
]);
const catalog = buildPublicCatalog({ appId, tiers, addOns });
```

A snapshot is a price list with a timestamp (`fetchedAt`), not a cache: rebuild it whenever the page
is rebuilt, because a seeded catalog is served for the shared cache's 60 s TTL before anything
refetches, and a stale build ships stale prices. Both endpoints are public, so no session is needed.
`invalidatePublicCatalog()` drops the seeded entry and refreshes every mounted view if you want the
live list sooner. `includeJsonLd` renders its script tag from the same catalog, which means a
prerendered page ships the prices it displays as structured data.

### Migration recipes

The three components these views replace are all still exported, so a site can move one page at a
time.

**(a) A signup page with `?tier` / `?pricing` / `?token`.** Parse the link with `parseSignupParams`
and hand the values over; the component reads the app's registration settings itself, so the local
copy of `registrationModeFor` (and the `useEffect` that fetched the authentication configuration for
it) goes away.

```tsx
import { parseSignupParams } from '@wildwood/core';
import { RegistrationAndSubscriptionComponent } from '@wildwood/react';

const { tierId, pricingId, addOnIds, token, email } = parseSignupParams(location.search);

<RegistrationAndSubscriptionComponent
  view="signup"
  preSelectedTierId={tierId}
  preSelectedPricingId={pricingId}
  preSelectedAddOnIds={addOnIds}
  registrationToken={token}
  prefillEmail={email}
  contactUrl="/contact"
  onSignupComplete={() => navigate('/company-profile')}
  onCancel={() => navigate('/')}
/>
```

Your own page chrome stays yours — the component renders the flow, not the page. The closed case is
handled inside it (`renderClosed` if you want your own words), so the "New accounts are not open
right now" branch can go too.

**(b) A landing pricing section.** `view="pricing"` and an `onSelect` that encodes the choice into
the signup link with `encodeCatalogSelection` from `@wildwood/core` (the same `tier` / `pricing` /
`addons` keys `parseSignupParams` reads back):

```tsx
import { encodeCatalogSelection } from '@wildwood/core';

<RegistrationAndSubscriptionComponent
  view="pricing"
  contactUrl="/contact?plan=enterprise"
  onSelect={(selection) => navigate(`/signup?${encodeCatalogSelection(selection)}`)}
/>
```

A packs-only section is the same view with `showPlans={false}`, `showAddOns`, `packSelection="multi"`
and your own headings — the grouping, the empty-group drop and the catch-all group are the
component's:

```tsx
<RegistrationAndSubscriptionComponent
  view="pricing"
  showPlans={false}
  showAddOns
  packSelection="multi"
  addOnGroups={PACK_GROUPS}
  describeAddOn={(addOn) => MARKETING_COPY[addOn.name]}
  onSelect={({ addOnIds }) => navigate(`/signup?addons=${addOnIds.join(',')}`)}
/>
```

**(c) A subscription page.** `view="manage"` replaces `SubscriptionAdminComponent` plus the modal
every site hand-built around `PaymentComponent`: drop the `onPaymentRequired` resolver, its ref, its
`useEffect` cleanup and the `.ww-modal-overlay` markup, and the view collects the card itself and
completes 3-D Secure changes. Keep `onMergeUsage` if you overlay your own counters, and add
`onEntitlementsChanged` to refresh whatever caches your app gates on.

```tsx
<RegistrationAndSubscriptionComponent
  view="manage"
  showStatusAboveTabs
  allowPackSelfService
  onMergeUsage={mergeUsage}
  onEntitlementsChanged={() => refreshEntitlements()}
/>
```

**(d) An invite page.** `tokenMode="required"` is invite redemption: the token is the only way in,
there is no plan and no pack step, and a closed app still honours its own invitations.

```tsx
<RegistrationAndSubscriptionComponent
  view="signup"
  tokenMode="required"
  registrationToken={params.get('invite') ?? undefined}
  prefillEmail={params.get('email') ?? undefined}
  planSelection="skip"
  packSelection="none"
  onSignupComplete={() => navigate('/')}
/>
```

`TokenRegistrationComponent` is still the right thing for a bare token form with no plan or pack
around it; the signup view renders it internally and adds the plan grant, the catalog and the
disclaimers step.

**(e) A pack-first signup.** A landing page that sells packs rather than plans sends its selection in
`?addons=`; the signup view takes the app's default plan and buys the packs after the login, so the
hand-built "now subscribe to the packs" phase goes away.

```tsx
<RegistrationAndSubscriptionComponent
  view="signup"
  planSelection="skip"
  preSelectedAddOnIds={parseSignupParams(location.search).addOnIds}
  onSignupComplete={({ packs }) => navigate('/welcome', { state: { packs } })}
/>
```

Ids that arrived in a URL are re-resolved against the live catalog, so a pack retired between the two
page loads is dropped rather than shown on an order summary. `describeAddOn` is a pricing-view prop:
the signup view renders the packs a link chose and the pack step's grid with the catalog's own words,
so put the marketing copy on the page that sells them.

## CSS Themes

Import the theme stylesheet to use Wildwood's CSS variable system:

```tsx
import '@wildwood/react/styles';
```

Themes are applied via `data-theme` attribute on the document root. Use `useTheme()` to switch themes.

## License

MIT
