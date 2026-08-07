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
| `useFeedback()` | Feedback widget config, submit, duplicate-check, vote |
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
- `NotificationComponent` — Notification list
- `NotificationToastComponent` — Animated toast popups
- `TwoFactorSettingsComponent` — 2FA setup wizard
- `TokenRegistrationComponent` — Token-based registration
- `AppTierComponent` — Tier comparison and selection
- `DisclaimerComponent` — Disclaimer display and acceptance
- `FeedbackComponent` — Floating feedback widget (screenshot, attachments, duplicate detection)

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

## CSS Themes

Import the theme stylesheet to use Wildwood's CSS variable system:

```tsx
import '@wildwood/react/styles';
```

Themes are applied via `data-theme` attribute on the document root. Use `useTheme()` to switch themes.

## License

MIT
