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
