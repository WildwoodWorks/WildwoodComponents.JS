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

Same API as `@wildwood/react` — hooks including `useAuth`, `useAI`, `useMessaging`, `usePayment`, `useSubscription`, `useNotifications`, `useTheme`, `useTwoFactor`, `useDisclaimer`, `useAppTier`, and more.

## Components

All components render using React Native primitives (`View`, `Text`, `TextInput`, `Pressable`/`TouchableOpacity`, `FlatList`, `ScrollView`, `Modal`):

- `AuthenticationComponent`, `AIChatComponent`, `SecureMessagingComponent`
- `PaymentComponent`, `PaymentFormComponent`, `SubscriptionComponent`, `SubscriptionManagerComponent`
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

Uses `StyleSheet`-based themes instead of CSS:

```tsx
import { defaultTheme, themes } from '@wildwood/react-native';

// Access theme colors
const { colors, spacing, typography } = defaultTheme;
```

## License

MIT
