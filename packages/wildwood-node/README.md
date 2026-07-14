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

## Seeder

Idempotent app-data seeding that runs at server startup. Define seed tasks
(each a stable-keyed, versioned, idempotent unit — AI flows, tiers, provider
wiring, ...); the runner topologically orders them by their `dependsOn` edges,
authenticates to WildwoodAPI as a CompanyAdmin service account, consults the
server-side ledger to skip already-seeded tasks, runs the rest with bounded
retries, and records ledger + history. It is the server-side counterpart of the
.NET `WildwoodComponents.Shared/Seeder` component (there is no browser/mobile
equivalent, so it lives in `@wildwood/node`, not `@wildwood/core`).

```typescript
import { runSeeder, SeederTaskResult, type SeederTask } from '@wildwood/node';

const seedTiers: SeederTask = {
  key: 'myapp.tiers.default',
  name: 'Default tiers',
  note: 'Free + Pro tiers with baseline limits',
  version: 1, // bump to force a re-run on next startup
  dependsOn: [],
  async run(ctx) {
    const existing = await ctx.client.get<unknown[]>(`api/app-tiers/${ctx.appId}`);
    if (Array.isArray(existing) && existing.length > 0) {
      return SeederTaskResult.alreadyPresent('Tiers already exist.');
    }
    if (!ctx.shouldWrite('create default tiers')) {
      return SeederTaskResult.skipped('dry-run');
    }
    await ctx.client.post(`api/app-tiers/${ctx.appId}`, { name: 'Free' });
    return SeederTaskResult.created('Created default tiers.');
  },
};

// Best-effort, non-fatal: never crashes the host if WildwoodAPI is down or a
// task fails — data is just left unseeded until the next start.
void runSeeder(
  {
    baseUrl: process.env.WILDWOOD_API_URL!,
    appId: process.env.WILDWOOD_APP_ID!,
    adminEmail: process.env.WILDWOOD_SEEDER_EMAIL, // CompanyAdmin service account (no 2FA)
    adminPassword: process.env.WILDWOOD_SEEDER_PASSWORD,
    environment: process.env.NODE_ENV === 'production' ? 'Production' : 'Dev',
  },
  [seedTiers],
);
```

Use `createSeederRunner(options, tasks)` + `runner.runPending()` if you want to
drive the pass yourself (e.g. from a CLI) instead of the startup helper. The
server admin can disable seeding per app or tune retries via the seeder
configuration; a local `runOnStartup: false` hard-gates it without a round trip.

Notes:

- **Local HTTPS dev backends:** for a loopback `baseUrl` (`https://localhost:…`)
  the client accepts a self-signed cert by default (via the optional `undici`
  package), matching the .NET seeder. Set `allowInsecureLoopback: false` to
  enforce validation, or `NODE_TLS_REJECT_UNAUTHORIZED=0` if `undici` is absent.
  Certificate validation is **never** relaxed for non-loopback hosts.
- **Cancellation:** pass an `AbortSignal` as the 4th argument to `runSeeder`
  (or to `runner.runPending(signal)`); aborting it cancels in-flight requests so
  a graceful shutdown does not block on the request timeout.
- **Run-once:** `runSeeder` ignores a duplicate concurrent invocation for the
  same app + environment in the same process.

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
| Seeder         | --                  | --    | --           | runSeeder / SeederRunner |

The Seeder is intentionally `node`-only — it is a server-side provisioning
harness (CompanyAdmin login, startup seeding), so it has no core service or
client (react / react-native / Swift) counterpart, mirroring the .NET seeder
living in `WildwoodComponents.Shared` for server hosts.

The Feedback `node` entry is `createFeedbackProxyMiddleware` — a server-side
proxy that lets an Express/SSR backend host the browser widget while keeping the
API key and bearer token off the client. The core `feedbackService` is also
re-exported for direct server-side use.

## License

MIT
