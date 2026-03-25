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

#### `useSubscriptionAdmin()`

Full admin hook for subscription management. Returns state + action methods for all 3 scopes (self, company, user).

```jsx
import { useSubscriptionAdmin } from '@wildwood/react';

const admin = useSubscriptionAdmin();

// Load data — routes automatically based on context
await admin.refreshAll(appId);                        // self
await admin.refreshAll(appId, companyId);              // company scope
await admin.refreshAll(appId, companyId, userId);      // user scope

// State
admin.subscription          // UserTierSubscriptionModel | null
admin.tiers                 // AppTierModel[]
admin.addOns                // AppTierAddOnModel[]
admin.addOnSubscriptions    // UserAddOnSubscriptionModel[]
admin.featureDefinitions    // AppFeatureDefinitionModel[]
admin.featureStatus         // Record<string, boolean>
admin.featureOverrides      // AppFeatureOverrideModel[]
admin.limitStatuses         // AppTierLimitStatusModel[]
admin.loading               // boolean
admin.error                 // string | null

// Admin actions
await admin.setFeatureOverride(appId, userId, featureCode, isEnabled, reason?, expiresAt?);
await admin.removeFeatureOverride(appId, featureCode, userId?);
await admin.updateUsageLimit(appId, limitCode, newMaxValue);
await admin.resetUsage(appId, limitCode);
await admin.subscribeUserToTier(appId, userId, tierId, pricingId?);
await admin.cancelUserSubscription(appId, userId);
// ... and more (company-scoped variants, add-on management, etc.)
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

#### `SubscriptionAdminComponent` — Full subscription management (authenticated)

Tabbed admin interface for subscription management. Includes panels for subscription status, tier plans, features & add-ons, and usage limits. This is the recommended single-component solution for subscription management pages.

```jsx
import { SubscriptionAdminComponent } from '@wildwood/react';

// End-user self-service mode
<SubscriptionAdminComponent
  appId={APP_ID}
  showStatusAboveTabs={true}
  selfService={true}
  showBillingToggle={true}
  currency="USD"
/>

// Admin mode — manage a specific user's subscription
<SubscriptionAdminComponent
  appId={APP_ID}
  userId={targetUserId}
  isAdmin={true}
  showStatusAboveTabs={true}
  currency="USD"
/>
```

Props:
- `selfService` (default `false`): When true, uses `POST /my-subscription` (end-user). When false, uses admin subscribe endpoint.
- `isAdmin` (default `false`): When true, enables admin controls: feature toggle overrides, usage limit editing/reset, and the Overrides tab.
- `userId` (optional): When provided, uses user-scoped admin endpoints to manage a specific user's subscription, features, and usage.
- `companyId` (optional): When provided, uses company-scoped endpoints for admin management of a specific company's subscription.
- `showStatusAboveTabs` (default `false`): When true, renders subscription status in a prominent card above tabs and removes the Subscription tab.
- `displayMode` (default `'tabs'`): Set to `'subscription'`, `'tiers'`, `'features'`, `'usage'`, or `'overrides'` to render a single panel instead of tabs.

**Admin capabilities** (when `isAdmin={true}`):
- **FeaturesPanel**: Toggle features on/off with confirmation flow (reason + expiration). Shows override badge on features with active overrides.
- **UsageLimitsPanel**: Inline edit max values, reset usage counters per limit.
- **OverridesPanel**: View all active feature overrides, make them permanent (remove expiration), or remove them entirely.
- **3-context routing**: Handlers automatically route API calls through `userId > companyId > self` context.

#### Sub-panels (individually importable)

Each tab's content is a standalone component you can use independently:

```jsx
import {
  SubscriptionStatusPanel,
  TierPlansPanel,
  FeaturesPanel,
  AddOnsPanel,
  UsageLimitsPanel,
  OverridesPanel,
} from '@wildwood/react';
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

// Admin — feature overrides
const overrides = await client.appTier.getFeatureOverrides(appId, userId);
await client.appTier.setFeatureOverride(appId, userId, 'FEATURE_CODE', true, 'reason', expiresAt);
await client.appTier.removeFeatureOverride(appId, 'FEATURE_CODE', userId);

// Admin — usage limit overrides
await client.appTier.updateUsageLimit(appId, 'LIMIT_CODE', 1000);
await client.appTier.resetUsage(appId, 'LIMIT_CODE');

// Admin — user-scoped management
const sub = await client.appTier.getUserSubscriptionAdmin(appId, userId);
await client.appTier.subscribeUserToTier(appId, userId, tierId, pricingId);
await client.appTier.cancelUserSubscription(appId, userId);
```

### Node.js AdminClient — server-side tier admin

`@wildwood/node` `AdminClient` exposes the same admin operations for server-to-server use (API key auth, no JWT):

```typescript
import { createAdminClient } from '@wildwood/node';

const admin = createAdminClient({ baseUrl: API_URL, apiKey: API_KEY });

// Subscription management
await admin.subscribeUserToTier(appId, userId, tierId, pricingId);
await admin.cancelUserSubscription(appId, userId);

// Feature overrides
await admin.setFeatureOverride(appId, userId, 'FEATURE_CODE', true, 'reason');
await admin.removeFeatureOverride(appId, 'FEATURE_CODE', userId);

// Usage limits
await admin.updateUsageLimit(appId, 'LIMIT_CODE', 1000);
await admin.resetUsage(appId, 'LIMIT_CODE');
await admin.resetUserUsage(appId, userId, 'LIMIT_CODE');
```

### Integration pattern: Landing page → Signup → Subscription

1. **Landing page** (unauthenticated): Use `PricingDisplayComponent` with `onSelectTier` to navigate to signup with `?tier=<id>`
2. **Signup page**: Use `SignupWithSubscriptionComponent` with `preSelectedTierId` from URL params
3. **Dashboard** (authenticated): Use `UsageDashboardComponent` for usage overview
4. **Subscription management page**: Use `SubscriptionAdminComponent` — single component with tabbed UI for subscription status, tier plans, features & add-ons, and usage

### Common mistakes to avoid (subscription/usage)

| Mistake | Correct approach |
|---------|-----------------|
| Using `AppTierComponent` on public pages | Use `PricingDisplayComponent` (no auth required) |
| Building custom usage progress bars | Use `UsageDashboardComponent` |
| Manually calling tier check endpoints | Use `useUsageDashboard()` hook |
| Custom signup + subscribe flow | Use `SignupWithSubscriptionComponent` |
| Manually wiring individual subscription panels | Use `SubscriptionAdminComponent` (single component with tabs) |
| Using admin subscribe endpoint for end-users | Set `selfService={true}` on `SubscriptionAdminComponent` |

### Debugging empty subscription/tier data

SDK service methods (`getUserSubscription`, `getUserFeatures`, `getFeatureDefinitions`, etc.) have try/catch blocks that return empty defaults (`null`, `[]`, `{}`) on failure. **A 401 error looks identical to "no data exists".**

**Debugging checklist** (most common → least common):

1. **Check `UserCompanies` table** — Does the user have a row matching the tier's `CompanyId`? Without it, the JWT has no `company_id` claim, and all tenant-filtered queries return empty.
2. **Check JWT claims** — Decode the token to verify `company_id` is present. User must log out and back in after `UserCompanies` is populated.
3. **Check `session.accessToken`** — Is it null? The getter is a property (`client.session.accessToken`), not a method.
4. **Check API key middleware** — Tier endpoints (`/api/app-tiers/*`, `/api/app-tier-addons/*`, `/api/app-feature-definitions/*`) must be bypassed in `ApiKeyMiddleware`.
5. **Check `[Authorize]` vs `[AllowAnonymous]`** — Public endpoints (like `/public` tiers) need `[AllowAnonymous]`; user-facing endpoints need `[Authorize]` (not `[Authorize(Roles = "Admin")]`).

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
