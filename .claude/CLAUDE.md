# Wildwood.JS SDK Monorepo

## Overview

pnpm workspaces monorepo containing the Wildwood JavaScript/TypeScript SDK ecosystem. Ports the .NET WildwoodComponents libraries to JS frameworks.

## Packages

| Package | Path | Description |
|---------|------|-------------|
| @wildwood/core | packages/wildwood-core/ | Pure TS SDK - auth, API client, models (browser + Node.js) |
| @wildwood/react | packages/wildwood-react/ | React hooks + components |
| @wildwood/react-native | packages/wildwood-react-native/ | React Native components |
| @wildwood/node | packages/wildwood-node/ | Express middleware + server-side SDK |

## Test Suite

| App | Path | Description |
|-----|------|-------------|
| wildwood-test-suite-react | WildwoodComponentsTestSuite.React/ | Vite + React test harness (port 5280) |

## Commands

```bash
pnpm install              # Install all deps
pnpm -r build             # Build all packages
pnpm --filter @wildwood/core build   # Build single package
cd WildwoodComponentsTestSuite.React && pnpm dev  # Start test suite
```

## Architecture

- **@wildwood/core** is the foundation - pure TS, zero UI deps, native fetch
- **@wildwood/react** and **@wildwood/react-native** are thin wrappers providing hooks + components over core
- **@wildwood/node** provides Express middleware for server-side JWT validation and API proxying
- All packages use **tsup** for ESM + CJS dual builds with TypeScript declarations
- Test suite uses **Vite** dev server

## Key Patterns

- `createWildwoodClient(config)` factory in core creates all services
- React/RN use `WildwoodProvider` + `useWildwood()` context pattern
- `StorageAdapter` abstraction: localStorage (browser), memory (RN/Node), custom
- JWT auto-refresh at 80% lifetime via SessionManager
- Typed event emitter for cross-cutting concerns (authChanged, sessionExpired, themeChanged)
- `--ww-*` CSS variables matching the Blazor/Razor theme system

## Quick Start: Integrating a New React App

Follow this pattern to add Wildwood auth to any React app. Proven in the APIMCP project.

### 1. Install packages

```bash
npm install @wildwood/core @wildwood/react
```

### 2. Wrap app in WildwoodProvider (App.jsx)

```jsx
import { WildwoodProvider } from '@wildwood/react';

<WildwoodProvider config={{
  baseUrl: import.meta.env.VITE_WILDWOOD_URL,
  appId: import.meta.env.VITE_WILDWOOD_APP_ID,
  apiKey: import.meta.env.VITE_WILDWOOD_API_KEY,
  enableAutoTokenRefresh: true,
}}>
  {/* routes/app content */}
</WildwoodProvider>
```

### 3. Auth — use SDK hooks directly, never create a custom AuthContext

```jsx
import { useAuth } from '@wildwood/react';

const { user, logout, isAuthenticated, isInitialized } = useAuth();
// user.email, user.firstName, user.lastName, user.companyId, user.roles
```

### 4. Route protection

```jsx
import { ProtectedRoute } from '@wildwood/react';
import { Navigate, Outlet } from 'react-router-dom';

<Route element={
  <ProtectedRoute
    loadingFallback={<Spinner />}
    unauthenticatedFallback={<Navigate to="/login" replace />}
  >
    <Outlet />
  </ProtectedRoute>
}>
  {/* protected routes */}
</Route>
```

Or write a thin wrapper using `useAuth()` if the app needs custom loading/redirect behavior.

### 5. Login/Registration pages — use pre-built components

```jsx
import { AuthenticationComponent, TokenRegistrationComponent } from '@wildwood/react';

// Login page
<AuthenticationComponent appId={appId} onAuthenticationSuccess={handleSuccess} />

// Registration page
<TokenRegistrationComponent appId={appId} autoLogin={true} />
```

### 6. Calling the app's own API (not Wildwood API)

Use `useExternalApi()` — it auto-attaches the Wildwood session JWT:

```jsx
import { useExternalApi } from '@wildwood/react';

function MyComponent() {
  const api = useExternalApi({ baseUrl: '/api' });

  const data = await api.get('/my-endpoint');
  await api.post('/my-endpoint', { name: 'New Item' });
  await api.put('/my-endpoint/123', updatedData);
  await api.del('/my-endpoint/123');
}
```

For module-level (non-React) code, use `createExternalApiClient` from `@wildwood/core`:

```typescript
import { createExternalApiClient } from '@wildwood/core';

const api = createExternalApiClient(wildwoodClient.session, {
  baseUrl: 'https://api.myapp.com',
});
```

### 7. 401 Handling — let the SDK own it

**Do NOT force logout on 401 responses.** The SDK:
- Auto-refreshes tokens before expiry (80% lifetime)
- Retries requests once after 401 with a fresh token
- Fires `sessionExpired` only when refresh truly fails

Forcing logout on 401 causes login loops during token refresh.

### Common mistakes to avoid

| Mistake | Correct approach |
|---------|-----------------|
| Custom AuthContext wrapping SDK hooks | Use `useAuth()` from `@wildwood/react` directly |
| Reading `localStorage.getItem('ww_session_auth')` | Use `useExternalApi()` or `session.accessToken` |
| Forcing logout on 401 in axios interceptor | Let SDK handle via `sessionExpired` event |
| Creating custom login forms | Use `<AuthenticationComponent>` from SDK |
| Polling `session.isInitialized` manually | Use `useAuth().isInitialized` (reactive) |

## Subscription Tiers, Usage & Pricing

### Hooks

#### `useUsageDashboard(options?)`

Fetches all limit statuses and subscription info for the authenticated user. Auto-refreshes on interval.

```jsx
import { useUsageDashboard } from '@wildwood/react';

const { limitStatuses, subscription, features, loading, error, refresh } = useUsageDashboard({
  refreshInterval: 60000, // optional, ms
});
```

### Components

#### `UsageDashboardComponent` — Authenticated usage overview

Shows progress bars (green/yellow/red) for each tier limit, current tier badge, period info, overage indicators, and upgrade CTA.

```jsx
import { UsageDashboardComponent } from '@wildwood/react';

<UsageDashboardComponent
  showOverageInfo={true}
  warningThreshold={75}           // % at which bar turns yellow
  onUpgradeClick={() => navigate('/upgrade')}
/>
```

#### `OverageSummaryComponent` — Overage cost breakdown

Shows per-limit overage counts and estimated cost for the current billing period.

```jsx
import { OverageSummaryComponent } from '@wildwood/react';

<OverageSummaryComponent
  overageRate={0.003}             // cost per overage unit
  onViewDetails={() => console.log('details')}
/>
```

#### `PricingDisplayComponent` — Public pricing grid (no auth required)

Lightweight pricing grid for landing pages. Fetches tiers via `getPublicTiers()` — no authentication needed.

```jsx
import { PricingDisplayComponent } from '@wildwood/react';

<PricingDisplayComponent
  title="Choose Your Plan"
  subtitle="Get started with the plan that fits your needs"
  showBillingToggle={true}
  showFeatureComparison={true}
  showLimits={true}
  enterpriseContactUrl="/contact"
  onSelectTier={(tier) => navigate(`/signup?tier=${tier.id}`)}
/>
```

#### `SignupWithSubscriptionComponent` — Collect Info → Choose Plan → Register + Subscribe

Multi-step flow with **deferred user creation**: collects registration data (Step 1), shows tier selection via `PricingDisplayComponent` (Step 2, no auth needed), then atomically registers the user, logs them in, and subscribes to the selected tier. User is NOT created until after they confirm their plan selection.

```jsx
import { SignupWithSubscriptionComponent } from '@wildwood/react';

<SignupWithSubscriptionComponent
  appId={APP_ID}
  preSelectedTierId={tierIdFromUrl}  // optional, from pricing page
  allowOpenRegistration={true}
  requireToken={false}
  onComplete={() => navigate('/')}
  onCancel={() => navigate('/pricing')}
/>
```

**Key design decision**: User creation is deferred until after tier confirmation (or payment for paid tiers). This prevents orphaned user accounts when users abandon signup mid-flow. The `TokenRegistrationComponent` runs in `deferSubmission` mode — it validates the form client-side but does not call the API until the user completes all steps.

**Blazor parity**: The Blazor `SignupWithSubscriptionComponent` (`WildwoodComponents.Blazor`) uses the same deferred pattern. Both JS and Blazor implementations share: deferred user creation, retry with sub-step tracking (`registered`/`loggedIn` flags), password clearing after login, non-fatal subscription failure with warning on the success step, and `PricingDisplayComponent` for unauthenticated tier selection with `PreSelectedTierId` highlight.

### Core service methods

```typescript
import { createWildwoodClient } from '@wildwood/core';

const client = createWildwoodClient(config);

// Public — no auth required
const tiers = await client.appTier.getPublicTiers(appId);

// Authenticated — returns all limit statuses for the current user
const limits = await client.appTier.getAllLimitStatuses(appId);
```

### Integration pattern: Landing page → Signup → Subscription

1. **Landing page** (unauthenticated): Use `PricingDisplayComponent` with `onSelectTier` to navigate to signup with `?tier=<id>`
2. **Signup page**: Use `SignupWithSubscriptionComponent` with `preSelectedTierId` from URL params
3. **Dashboard** (authenticated): Use `UsageDashboardComponent` for usage overview
4. **Subscription management page**: Combine `UsageDashboardComponent` + `OverageSummaryComponent` + `AppTierComponent`

### Common mistakes to avoid (subscription/usage)

| Mistake | Correct approach |
|---------|-----------------|
| Using `AppTierComponent` on public pages | Use `PricingDisplayComponent` (no auth required) |
| Building custom usage progress bars | Use `UsageDashboardComponent` |
| Manually calling tier check endpoints | Use `useUsageDashboard()` hook |
| Custom signup + subscribe flow | Use `SignupWithSubscriptionComponent` |

## Real-World Integration Examples

- **APIMCP**: `C:\Development\APIMCP\Dev\APIMCP\APIMCPAdmin\` — React + Vite admin app using all the patterns above
- **WildwoodComponentsTestSuite.React**: `WildwoodComponentsTestSuite.React/` — SDK test harness

## WildwoodAPI Connection

Default test configuration — see `WildwoodComponentsTestSuite.React/.env.example`:
- **API URL**: https://api.wildwoodworks.com.co/api/
- **AppId**: Set via `VITE_APP_ID` environment variable
- **Test user**: Configure in `.env` file (not committed)

## Related Projects

- **WildwoodAPI**: `C:\Development\WildwoodAPI\Dev\WildwoodAPI\`
- **WildwoodComponents.Blazor**: `C:\Development\WildwoodAPI\Dev\WildwoodComponents.Blazor\`
- **WildwoodComponents.Razor**: `C:\Development\WildwoodAPI\Dev\WildwoodComponents.Razor\`
