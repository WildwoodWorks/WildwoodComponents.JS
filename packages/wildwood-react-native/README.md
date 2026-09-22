# @wildwood/react-native

[![npm version](https://img.shields.io/npm/v/@wildwood/react-native.svg)](https://www.npmjs.com/package/@wildwood/react-native)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@wildwood/react-native)](https://bundlephobia.com/package/@wildwood/react-native)

React Native components and hooks for the Wildwood API platform. Native UI rendering with the same hook API as `@wildwood/react`.

## Installation

```bash
npm install @wildwood/core @wildwood/react-native
# or
pnpm add @wildwood/core @wildwood/react-native
```

## Quick Start

```tsx
import { WildwoodProvider, useAuth, AuthenticationComponent } from '@wildwood/react-native';

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
    <View>
      <Text>Welcome, {user?.firstName}!</Text>
      <Pressable onPress={logout}><Text>Logout</Text></Pressable>
    </View>
  );
}
```

## Hooks

Same API as `@wildwood/react` — hooks including `useAuth`, `useAI`, `useMessaging`, `usePayment`, `useNotifications`, `useTheme`, `useTwoFactor`, `useDisclaimer`, `useAppTier`, and more.

## Components

All components render using React Native primitives (`View`, `Text`, `TextInput`, `Pressable`/`TouchableOpacity`, `FlatList`, `ScrollView`, `Modal`):

- `AuthenticationComponent`, `AIChatComponent`, `SecureMessagingComponent`
- `PaymentComponent`, `PaymentFormComponent`
- `NotificationComponent`, `NotificationToastComponent`
- `TwoFactorSettingsComponent`, `TokenRegistrationComponent`
- `AppTierComponent`, `DisclaimerComponent`, `FeedbackComponent`

### Cross-platform parity

These components have full core/react/react-native coverage (`node` is server-side only, no UI):

| Component | core (service) | react | react-native | node |
|-----------|----------------|-------|--------------|------|
| Authentication | authService | ✓ | ✓ | tokenValidator |
| AI Chat | aiService | ✓ | ✓ | -- |
| Messaging | messagingService | ✓ | ✓ | -- |
| Payments | paymentService | ✓ | ✓ | -- |
| App Tiers | appTierService | ✓ | ✓ | AdminClient |
| Notifications | notificationService | ✓ | ✓ | -- |
| Two-Factor | twoFactorService | ✓ | ✓ | -- |
| Disclaimers | disclaimerService | ✓ | ✓ | -- |
| Feedback | feedbackService | ✓ | ✓ | -- |

**OAuth in `AuthenticationComponent`** — React Native has no popup window, so the browser step is injected: pass `onProviderSignIn={(provider, authorizationUrl) => Promise<string | null>}`, open the URL with `expo-auth-session`/`expo-web-browser`, and resolve with the provider token/authorization code from the callback (or `null` if cancelled). The component completes the login via `loginWithProvider`. Provider buttons are hidden when the prop is omitted — same injection pattern as `FeedbackComponent`'s `captureScreenshot`, so there is no hard Expo dependency.

```tsx
import * as WebBrowser from 'expo-web-browser';

<AuthenticationComponent
  onProviderSignIn={async (provider, authUrl) => {
    if (!authUrl) return null;
    const result = await WebBrowser.openAuthSessionAsync(authUrl, 'myapp://oauth');
    return result.type === 'success' ? new URL(result.url).searchParams.get('code') : null;
  }}
/>
```

**`FeedbackComponent`** — a floating launcher button that opens a slide-up modal feedback form (type picker, title with duplicate detection, description, anonymous email/name when unauthenticated, submit). It reuses the core `feedbackService` and the `useFeedback` hook, hides itself when the viewer is anonymous and the app forbids anonymous feedback, and enforces the app's `RequireScreenshot` setting. Native differences from web: no file attachments, and a minimal `Platform` + `Dimensions` diagnostic context instead of the web's `window`-based one. Pass `appId` explicitly or let it fall back to the `WildwoodProvider` config.

```tsx
import { FeedbackComponent } from '@wildwood/react-native';

// Floating widget — sits over your app, opens a modal on tap
<FeedbackComponent appId={APP_ID} position="bottom-right" />
```

Screenshot capture is opt-in (RN has no DOM/html2canvas). Wire the `captureScreenshot` prop — e.g. with [`react-native-view-shot`](https://github.com/gre/react-native-view-shot) — to enable the screenshot UI:

```tsx
import { captureScreen } from 'react-native-view-shot';

<FeedbackComponent
  appId={APP_ID}
  captureScreenshot={() => captureScreen({ format: 'jpg', quality: 0.8, result: 'data-uri' })}
/>
```

## Taking card payments

`PaymentComponent` initiates the payment, follows a provider's redirect and reports the result on its
own. What it cannot do is show a card sheet or a bank's 3-D Secure challenge: that needs a native
payment SDK, a rebuild and (on iOS) merchant configuration, so **this package depends on no payment
SDK at all** — the same injection pattern as `captureScreenshot` and `onProviderSignIn`.

**Without a handler nothing is required of the app** and nothing changes: the component never tells
the server it can confirm an intent, never asks for a `SetupIntent`, and opens the provider's own page
when one is offered.

**With a handler** the component asks for a `SetupIntent` when the plan starts a free trial (so the
card is saved for the charge at trial end rather than charged today), confirms the intent through your
SDK, then has the server verify it. Wire it once on the provider, or per component:

```tsx
// HOST CODE — @stripe/stripe-react-native is YOUR dependency, not the SDK's.
import { StripeProvider, confirmPayment, confirmSetupIntent } from '@stripe/stripe-react-native';
import { WildwoodProvider, type PaymentActionAdapter } from '@wildwood/react-native';

// Module scope: a fresh object each render re-renders every consumer.
const stripeActions: PaymentActionAdapter = {
  async confirmPayment(clientSecret) {
    const { error } = await confirmPayment(clientSecret, { paymentMethodType: 'Card' });
    if (!error) return { status: 'succeeded' };
    return error.code === 'Canceled' ? { status: 'cancelled' } : { status: 'failed', message: error.message };
  },
  async confirmCardSetup(clientSecret) {
    const { error } = await confirmSetupIntent(clientSecret, { paymentMethodType: 'Card' });
    if (!error) return { status: 'succeeded' };
    return error.code === 'Canceled' ? { status: 'cancelled' } : { status: 'failed', message: error.message };
  },
};

<StripeProvider publishableKey={PUBLISHABLE_KEY}>
  <WildwoodProvider config={config} paymentActionHandler={stripeActions}>
    <MyApp />
  </WildwoodProvider>
</StripeProvider>;
```

`PaymentSheet` works just as well — the adapter only has to resolve `succeeded`, `failed` (with a
message to show) or `cancelled`. **`cancelled` is not a failure**: the customer is returned to the form
with nothing said, and the next attempt confirms the same intent rather than starting a second
subscription. A handler that implements `confirmPayment` but not `confirmCardSetup` is treated as no
handler for trials — a `SetupIntent` nothing can confirm leaves a trial with no saved card.

```tsx
<PaymentComponent
  amount={99}
  currency="USD"
  pricingModelId={pricingId}
  isSubscription
  trialDays={14}
  description="Pro plan"
  onPaymentSuccess={(result) => subscribe(result.transactionId)}
  onContinue={() => navigation.navigate('Home')} // no Continue button without this
/>
```

`onPaymentSuccess` / `onPaymentComplete` fire exactly once per payment; `onContinue` is what advances
the host. Omit `amount` for the free-form payment screen (the customer types the amount), and pass
`billingAddress` for an app whose payment configuration requires one.

## Registration & Subscription

One component over everything a customer does with money: see the price list, sign up and buy, and
manage what they bought. `RegistrationAndSubscriptionComponent` is a thin switch on `view`; each view
is also exported on its own, for a screen that would rather pick an import than pass a prop.

```tsx
import { RegistrationAndSubscriptionComponent } from '@wildwood/react-native';

// Pricing — no session needed. Hand the choice to your navigator.
<RegistrationAndSubscriptionComponent
  view="pricing"
  showAddOns
  packSelection="multi"
  onSelect={({ tierId, pricingId, addOnIds }) => navigation.navigate('Signup', { tierId, pricingId, addOnIds })}
/>

// Signup — account, plan, packs, card.
<RegistrationAndSubscriptionComponent
  view="signup"
  preSelectedTierId={route.params.tierId}
  preSelectedPricingId={route.params.pricingId}
  preSelectedAddOnIds={route.params.addOnIds}
  onSignupComplete={(outcome) => navigation.replace('Home', { userId: outcome.userId })}
/>

// Manage — the plan, its packs, features, usage and (for an admin) overrides.
<RegistrationAndSubscriptionComponent
  view="manage"
  layout="stacked"
  allowPackSelfService
  onEntitlementsChanged={(reason) => refreshGates(reason)}
/>
```

The views are `RegistrationSubscriptionPricing`, `RegistrationSubscriptionSignup` and
`RegistrationSubscriptionManage`. Their props mirror `@wildwood/react`'s name-for-name, with the
differences below — all of them because a phone is not a web page.

| Prop | Difference | Why |
|---|---|---|
| `className` | Not here. `style` and `testID` take its place. | React Native has no class names. The `testID`s carry the web's `data-ww-view` / `data-ww-step` / `data-ww-pack` strings unchanged, so one test plan reads the same on both stacks. |
| `initialCatalog`, `includeJsonLd` | Not here. | There is no server render to seed from and no crawler to publish schema.org offers to. |
| `returnUrl` | Not here. | The web carries it without ever navigating to it. A native screen has no URL to come back to — where a finished signup goes is the navigator's business, and `onSignupComplete` is where you hang that. |
| `paymentOrder` (signup) | Defaults to `'afterAccount'`; the web is `'beforeAccount'`. | A store purchase that succeeds before a registration that then fails strands a paid subscription with nobody to attach it to. An account with no plan is the cheaper and the recoverable failure, so the account is made first. Pass `'beforeAccount'` for the web's order if you bill by card only. |
| `paymentActionHandler` (signup, manage) | New. A `PaymentActionAdapter`, as in **Taking card payments** above. | There is no Stripe.js here. See that section for the `@stripe/stripe-react-native` recipe; wire it once on `WildwoodProvider` and every surface picks it up. |
| `iapProducts` (signup) | New. Maps each tier to a store product id. | A store-billed app buys its plan from the store, through `useInAppPurchases` / `InAppPurchaseSheet`. |

`planDefault` (signup) is one of the props that mirror the web exactly, because the flow behind both
is the same one: `planDefault="free"` opens the plan step with the app's free plan marked — a
suggestion the visitor still taps, not a choice already made — and is ignored for an invite, for an
app with no free plan, and once a link or a grant has chosen. The grid marks
`state.selection.tierId ?? flow.defaultTierId ?? preSelectedTierId`, in that order: a
`preSelectedTierId` still on screen at the plan step is one the flow refused, so the default wins
over it. Use `preSelectedTierId` to choose FOR the visitor — it skips the step outright.

**Without a `paymentActionHandler`** nothing is asked of the app and nothing fails silently. Packs are
bought against a card already on file or reported as not bought ("This purchase has to be finished on
the web"); no `SetupIntent` is ever requested, because a client secret nothing on the device can
confirm is worse than none. A plan change is posted in the plain form — the server is never told this
device can answer a 3-D Secure challenge, so it refuses a change that needs one instead of parking it
where nobody can finish it. **With** a handler, the change is parked, the challenge is put to the
customer and the parked change is completed.

**The card for a plan change** comes from your own `onPaymentRequired` when you pass one; its answer
is final (a transaction id completes the change, an empty answer abandons it). Without one, the
component's own `PaymentModal` takes it — closing that returns to the confirmation with the priced
change intact. This is also how `SubscriptionAdminComponent` now behaves; a host that already passes
`onPaymentRequired` keeps exactly the behaviour it had.

**App-Store- or Play-billed apps** (`requiresAppStorePayment`) are asked about per platform, not
guessed. Plans are bought from the store; pack PURCHASE is not offered, because there is no store
product behind an add-on — owned, bundled and included packs still render and can still be cancelled.
The plan-change confirmation drops the server's proration figures and says the store manages billing
for the change instead, since a store prices its own subscriptions.

`SignupWithSubscriptionComponent`, `AppTierComponent` and `PricingDisplayComponent` are deprecated in
favour of these views. All three keep working exactly as documented; nothing has been removed.

### Test helpers (`@wildwood/react-native/testing`)

A subpath beside the package entry, so an app that never writes tests never loads it:

```ts
import { WW_IDS, waitForSignupStep, finishSignup } from '@wildwood/react-native/testing';
```

It ships **no dependency and no peer dependency**, and imports nothing from `react-native` — the
built module runs in a plain Node script. Detox, React Native Testing Library and Maestro agree on
nothing but `testID`, so the runner is injected rather than imported.

**The identifier contract, as data.** `WW_SIGNUP_STEPS`, `WW_MANAGE_STEPS`, `WW_VIEWS`,
`WW_REGISTRATION_FIELDS` and `WW_IDS` are the strings these components render — the same ones the web
puts in `data-ww-*` and Swift in an `accessibilityIdentifier`, so one test plan reads every stack. A
Maestro flow takes only these, since YAML cannot call a function. `wwTestId`, `wwPackTestId`,
`wwGroupTestId`, `wwModalTestId` and `wwFieldTestId` are the same functions the components call, not a
second copy.

`WW_SIGNUP_STEPS` is the web's twelve `data-ww-step` values and deliberately **not** the signup
machine's `SignupStep`: the machine's last step is `done` where every stack's identifier says
`success`.

#### The `WwDriver` contract

Four methods, each addressed by `testID`, each async because an out-of-process runner's every answer
is a round trip:

| Method | Answers |
|---|---|
| `exists(testID)` | is an element carrying this id on screen? `false`, never a throw, when none is |
| `text(testID)` | its rendered text, or `null` |
| `tap(testID)` | press it |
| `type(testID, value)` | **replace** the input's contents |

Two rules the adapter owns rather than the helpers:

- **Scope.** Step ids are bare (`payment`, `failed`), so nothing in the string says which Wildwood
  surface it belongs to. A screen mounting two of them builds one driver per surface, matching within
  the view element that encloses the step — `WW_VIEWS` holds the three names. One surface on screen
  needs none of this.
- **Repeats.** Where several elements carry one id, act on the first. `disclaimer-accept` is rendered
  once per pending disclaimer, and the value-built ids name a row wherever it appears.

A Detox adapter, in full:

```ts
import { by, element, expect as detoxExpect } from 'detox';
import type { WwDriver } from '@wildwood/react-native/testing';

export const detoxDriver: WwDriver = {
  async exists(testID) {
    try {
      await detoxExpect(element(by.id(testID)).atIndex(0)).toExist();
      return true;
    } catch {
      return false;
    }
  },
  // iOS only: Detox has no stock way to read an element's text on Android. Check its current docs
  // before relying on this on both platforms.
  async text(testID) {
    const attributes = await element(by.id(testID)).atIndex(0).getAttributes();
    return 'text' in attributes ? (attributes.text ?? null) : null;
  },
  tap: (testID) => element(by.id(testID)).atIndex(0).tap(),
  // `replaceText`, NOT `typeText`: `typeText` appends, so a field refilled after a validation error
  // would be sent the old value with the new one on the end of it.
  type: (testID, value) => element(by.id(testID)).atIndex(0).replaceText(value),
};
```

React Native Testing Library is the same shape over `queryAllByTestId(id).length > 0`,
`fireEvent.press` and `fireEvent.changeText`.

#### What the helpers do

`currentSignupStep`, `waitForSignupStep` and `waitForSignupStepToLeave` read the flow's step. On the
web that is one `getAttribute`, because the step is an attribute VALUE; a `testID` is a name and
answers only "is an element called this on screen?", so the step has to be **probed** against the
twelve contract ids in turn. A wait costs one read per poll and spends the probe only on the failure,
where it names the step the flow is actually on instead of saying "timed out".

`acceptDisclaimers` and `finishSignup` are the scaffolding every host writes once:

```ts
await waitForSignupStep(driver, 'register');
await driver.type(wwFieldTestId('email'), user.email);
await driver.type(wwFieldTestId('password'), user.password);
// …and the rest. `WW_REGISTRATION_FIELDS` names all seven, the registration token included — which
// is why filling the form is the host's loop and not ours: which of the seven are on screen depends
// on the app's registration mode.
await driver.tap(WW_IDS.submitRegister);

// Waits out processing, retries a transient failure, accepts whatever disclaimers the app has
// configured, then leaves the success panel.
await finishSignup(driver);
```

Three things they encode that are easy to get wrong:

- **Accept All is conditional.** `DisclaimerComponent` renders `disclaimer-accept-all` only when more
  than one disclaimer is pending; with exactly one, `disclaimer-accept` is the only control. A loop
  written for Accept All alone returns having tapped nothing, and the next wait then times out on a
  flow nobody advanced — which reads as the product hanging.
- **A refused acceptance looks like a dead button, and this cannot see the refusal.**
  `disclaimeracceptance/accept` shares the API's per-IP auth rate limit with login and register, so a
  suite enrolling several users a minute from one address gets 429s while the button just sits there.
  The web helper watches the response and reports the status; a `WwDriver` watches nothing, and the
  component reports the refusal through a native `Alert` that carries no `testID`. So the bound is
  the same and the message **names** the rate limit as the usual cause rather than detecting it.
  Tune `maxTaps` and `tapSettleMs` if the device is merely slow.
- **Nothing is located by copy.** Every label these panels render comes from `labels.ts` and hosts
  reword them freely, so a wait on a button's text reads a rewording as a hang.

`observeSignupSteps` records the steps a run passed through, for asserting that one never happened
(`plan` and `payment` on a token grant). **It is best-effort, and the name says so.** The web's
`recordSignupSteps` installs a MutationObserver inside the page and sees every transition; a native
driver can only be asked, so this polls and **can miss a step that came and went between two polls**.
Everything in the record really happened, in that order; what is not in it may still have happened.
Use `expectNeverEntered` for a step the flow would rest on if it entered at all, not for one it
passes straight through.

#### Deliberately not shipped

| Web helper | Why there is no native one |
|---|---|
| `fillRegistrationForm` | Its value is entirely Playwright: a per-field selector list where `data-ww-field` is preferred over a React id, and `.first()` because a page may host two registration surfaces. Here it is one `driver.type(wwFieldTestId(field), value)` per field, over `WW_REGISTRATION_FIELDS` — a line a host writes better than we can guess at. |
| `submitRegistrationForm` | One `driver.tap(WW_IDS.submitRegister)`. The web version exists to prefer `data-ww-action="submit-register"` over `button[type="submit"]`, and there is no `<form>` here to fall back to. |
| `dismissConsentBanner` | It encodes that a fixed banner takes the clicks aimed at the page underneath it, and waits for actionability. Neither applies: `ConsentComponent` sits in the host's layout flow with no absolute positioning, so it covers nothing. The banner still carries `WW_IDS.consentBanner` and `WW_IDS.consentAcceptAll` for a test that wants to answer it. |
| `finishSignup`'s `expectSuccessText` | A `WwDriver` reads text by `testID` and the success message carries none; giving it one for this would coin a contract string no other stack has. Assert it with your runner's own text matcher after `finishSignup` returns. |

## Theme System

`StyleSheet`-based instead of CSS, but the token names mirror the web package's `--ww-*` custom
properties one-for-one, camelCased — `--ww-primary-dark` is `primaryDark`, `--ww-danger-bg` is
`dangerBg`. An app that has themed `@wildwood/react` by redefining `--ww-*` on `:root` can port the
same palette here by name.

React Native has no cascade, so the tokens travel through context rather than inheritance. Pass a
partial override to the provider; it layers over the default exactly as redefining a subset of CSS
variables does, leaving every other token intact:

```tsx
import { WildwoodProvider } from '@wildwood/react-native';

// Module scope, NOT inline: a fresh object literal each render defeats the provider's
// memoisation and rebuilds every component's StyleSheet.
const appTheme = { primary: '#0b1f3a', accent: '#c9a227' };

<WildwoodProvider config={config} theme={appTheme}>
  {children}
</WildwoodProvider>
```

Or select a built-in by the same name the web uses in `[data-theme]` — `'woodland-warm'` (default),
`'cool-blue'`, `'fall-colors'`:

```tsx
<WildwoodProvider config={config} theme="cool-blue">
```

Omit `theme` entirely and the provider follows `ThemeService` instead, so a stored user preference
applies on launch and `useTheme().setTheme(name)` restyles live. An explicit `theme` prop wins over
that — use it when the app ships one brand palette a user preference should not override.

Components read the active theme with `useWildwoodTheme()`:

```tsx
import { useWildwoodTheme, type WildwoodTheme } from '@wildwood/react-native';

const theme = useWildwoodTheme();
const styles = useMemo(() => createStyles(theme), [theme]);
```

`WildwoodTheme` is a flat set of semantic tokens (`primary`, `textMuted`, `dangerBg`,
`borderRadius`, …) — see `src/styles/theme.ts` for the full list. Gradients are deliberately
absent: `--ww-gradient-*` has no React Native equivalent without an extra dependency, so components
use the flat `primary`/`primaryDark` pair those gradients interpolate.

Not every component participates yet. Authentication, AppTier, UsageDashboard and Disclaimer read
the theme; the rest still hardcode their colours and can be converted to the same
`createStyles(theme)` shape.

## License

MIT
