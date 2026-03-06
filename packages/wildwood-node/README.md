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
import { validateToken } from '@wildwood/node';

const result = validateToken(token, {
  issuer: 'WildwoodAPI',
  audience: 'WildwoodApp',
});

if (result.valid) {
  console.log('User ID:', result.claims.sub);
}
```

## License

MIT
