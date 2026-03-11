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
