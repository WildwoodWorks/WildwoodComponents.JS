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
