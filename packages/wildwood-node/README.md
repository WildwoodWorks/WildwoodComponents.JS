# @wildwood/node

[![npm version](https://img.shields.io/npm/v/@wildwood/node.svg)](https://www.npmjs.com/package/@wildwood/node)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@wildwood/node)](https://bundlephobia.com/package/@wildwood/node)

Server-side SDK for the Wildwood API platform. Express middleware and admin utilities.

## Installation

```bash
npm install @wildwood/core @wildwood/node
# or
pnpm add @wildwood/core @wildwood/node
```

## Auth Middleware

Validates JWT tokens and attaches user info to the request:

```typescript
import express from 'express';
import { createAuthMiddleware } from '@wildwood/node';

const app = express();

const auth = createAuthMiddleware({
  baseUrl: 'https://your-api.example.com',
  apiKey: process.env.WILDWOOD_API_KEY,
});

app.use('/api', auth);

app.get('/api/profile', (req, res) => {
  res.json(req.wildwoodUser);
});
```

## Proxy Middleware

Proxies API requests with server-side API key injection (keeps keys off the client):

```typescript
import { createProxyMiddleware } from '@wildwood/node';

const proxy = createProxyMiddleware({
  baseUrl: 'https://your-api.example.com',
  apiKey: process.env.WILDWOOD_API_KEY,
});

app.use('/wildwood-api', proxy);
```

## Feedback Proxy

Hosts the browser feedback widget without exposing your API key (or a user's
token) to the client. Mount it on a path; the widget's browser calls are
forwarded to the Wildwood API with credentials attached server-side:

```typescript
import express from 'express';
import { createFeedbackProxyMiddleware } from '@wildwood/node';

const app = express();
app.use(express.json()); // required so POST bodies are parsed before the proxy

const feedback = createFeedbackProxyMiddleware({
  baseUrl: 'https://your-api.example.com',
  apiKey: process.env.WILDWOOD_API_KEY!,
  // Optional: attach a per-request bearer token from your SSR session.
  // Falls back to req.wildwoodToken (set by createAuthMiddleware) when omitted.
  getToken: (req) => req.session?.wildwoodToken,
});

app.use('/feedback', feedback);
```

Routes (relative to the mount path) and their upstream targets:

| Browser call (mount-relative)   | Upstream Wildwood API                                          |
| ------------------------------- | ------------------------------------------------------------- |
| `POST /submit`                  | `POST api/SystemFeedback`                                      |
| `GET  /duplicate-check?title=`  | `GET  api/SystemFeedback/duplicate-check`                      |
| `POST /:id/vote`                | `POST api/SystemFeedback/{id}/vote`                            |
| `GET  /widget?appId=`           | `GET  api/AppComponentConfigurations/{appId}/feedback/widget` |
| `GET  /:appId/widget`           | `GET  api/AppComponentConfigurations/{appId}/feedback/widget` |

For server-side feedback (a process submitting/voting directly), the core
`FeedbackService` is re-exported from this package.

## Admin Client

Server-side client for administrative operations:

```typescript
import { createAdminClient } from '@wildwood/node';

const admin = createAdminClient({
  baseUrl: 'https://your-api.example.com',
  apiKey: process.env.WILDWOOD_API_KEY,
});

const users = await admin.getUsers();
const apps = await admin.getApps();
```

## Token Validation

Validate JWT tokens without API calls:

```typescript
import { validateTokenClaims } from '@wildwood/node';

const result = validateTokenClaims(token, {
  issuer: 'WildwoodAPI',
  audience: 'WildwoodApp',
});

if (result.valid) {
  console.log('User ID:', result.payload?.sub);
}
```

## Cross-platform parity

`node` is server-side only, so a component's `node` entry is its server-side
equivalent (middleware / proxy / client), not a UI:

| Component      | core (service)      | react | react-native | node                |
| -------------- | ------------------- | ----- | ------------ | ------------------- |
| Authentication | authService         | ✓     | ✓            | tokenValidator      |
| AI Chat        | aiService           | ✓     | ✓            | --                  |
| Messaging      | messagingService    | ✓     | ✓            | --                  |
| Payments       | paymentService      | ✓     | ✓            | --                  |
| App Tiers      | appTierService      | ✓     | ✓            | AdminClient         |
| Notifications  | notificationService | ✓     | ✓            | --                  |
| Two-Factor     | twoFactorService    | ✓     | ✓            | --                  |
| Disclaimers    | disclaimerService   | ✓     | ✓            | --                  |
| Feedback       | feedbackService     | ✓     | ✓            | feedbackProxy       |

The Feedback `node` entry is `createFeedbackProxyMiddleware` — a server-side
proxy that lets an Express/SSR backend host the browser widget while keeping the
API key and bearer token off the client. The core `feedbackService` is also
re-exported for direct server-side use.

## License

MIT
