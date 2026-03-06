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
| `useAIFlow()` | AI flow definitions and execution |
| `useMessaging()` | Threads, messages, reactions, SignalR |
| `usePayment()` | Payment processing, saved methods |
| `useSubscription()` | Subscription plans and lifecycle |
| `useNotifications()` | Toast notification queue |
| `useTheme()` | Theme switching and persistence |
| `useTwoFactor()` | 2FA settings and credentials |
| `useCaptcha()` | CAPTCHA script lifecycle |
| `useDisclaimer()` | Disclaimer fetch and acceptance |
| `useAppTier()` | Tier browsing, feature gating |
| `usePlatformDetection()` | Browser/OS/device detection |
| `useWildwood()` | Direct access to WildwoodClient |
| `useWildwoodComponent()` | Base loading/error state pattern |

## Components

- `AuthenticationComponent` — Login/register with OAuth, passkeys, 2FA
- `AIChatComponent` — Chat UI with sessions, messages, TTS
- `AIProxyComponent` — Direct AI model interaction
- `SecureMessagingComponent` — Threads, messages, reactions, typing
- `PaymentComponent` — Payment method selection and processing
- `PaymentFormComponent` — Payment form with validation
- `SubscriptionComponent` — Plan browsing and selection
- `SubscriptionManagerComponent` — Subscription lifecycle management
- `NotificationComponent` — Notification list
- `NotificationToastComponent` — Animated toast popups
- `TwoFactorSettingsComponent` — 2FA setup wizard
- `TokenRegistrationComponent` — Token-based registration
- `AppTierComponent` — Tier comparison and selection
- `DisclaimerComponent` — Disclaimer display and acceptance

## CSS Themes

Import the theme stylesheet to use Wildwood's CSS variable system:

```tsx
import '@wildwood/react/styles';
```

Themes are applied via `data-theme` attribute on the document root. Use `useTheme()` to switch themes.

## License

MIT
