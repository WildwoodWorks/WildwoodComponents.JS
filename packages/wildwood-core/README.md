# @wildwood/core

[![npm version](https://img.shields.io/npm/v/@wildwood/core.svg)](https://www.npmjs.com/package/@wildwood/core)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@wildwood/core)](https://bundlephobia.com/package/@wildwood/core)

Pure TypeScript SDK for the Wildwood API platform. Framework-agnostic — works in browsers and Node.js.

## Installation

```bash
npm install @wildwood/core
# or
pnpm add @wildwood/core
```

## Quick Start

```typescript
import { createWildwoodClient } from '@wildwood/core';

const client = createWildwoodClient({
  baseUrl: 'https://your-api.example.com',
  appId: 'your-app-id',
  enableAutoTokenRefresh: true,
  sessionExpirationMinutes: 60,
});

// Authenticate
const response = await client.auth.login({
  email: 'user@example.com',
  password: 'password',
  appId: 'your-app-id',
  appVersion: '1.0.0',
  platform: 'web',
  deviceInfo: navigator.userAgent,
});

// Use services
const sessions = await client.ai.getSessions();
const threads = await client.messaging.getThreads();
const theme = client.theme.theme;
```

## Services

| Service | Description |
|---------|-------------|
| `client.auth` | Login, register, OAuth, passkeys, password reset, 2FA verification |
| `client.session` | Token storage, auto-refresh at 80% lifetime, sliding expiration |
| `client.ai` | Chat sessions, messages, TTS/STT, flow definitions, flow execution |
| `client.messaging` | Threads, messages, reactions, typing indicators, attachments, SignalR |
| `client.payment` | Payment processing, saved methods, subscriptions, provider config |
| `client.notifications` | Client-side toast notification queue |
| `client.twoFactor` | 2FA setup, recovery codes, trusted devices |
| `client.disclaimer` | Pending disclaimers, acceptance |
| `client.appTier` | Tier browsing, feature gating, limits, add-ons |
| `client.theme` | Theme persistence, CSS variable application |
| `client.events` | Typed event emitter (authChanged, sessionExpired, themeChanged) |

## Storage Adapters

```typescript
// Browser (default)
const client = createWildwoodClient({ ...config, storage: 'localStorage' });

// Node.js / testing
const client = createWildwoodClient({ ...config, storage: 'memory' });

// Custom adapter
const client = createWildwoodClient({
  ...config,
  storage: {
    getItem: async (key) => myStore.get(key),
    setItem: async (key, value) => myStore.set(key, value),
    removeItem: async (key) => myStore.delete(key),
  },
});
```

## Events

```typescript
client.events.on('authChanged', (isAuthenticated) => {
  console.log('Auth state:', isAuthenticated);
});

client.events.on('sessionExpired', () => {
  // Redirect to login
});

client.events.on('tokenRefreshed', () => {
  // Token was auto-refreshed
});
```

## Optional Dependencies

- `@microsoft/signalr` — Required only if using real-time messaging (`client.messaging`)

## License

MIT
