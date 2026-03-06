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

## WildwoodAPI Connection

Default test configuration — see `WildwoodComponentsTestSuite.React/.env.example`:
- **API URL**: https://api.wildwoodworks.com.co/api/
- **AppId**: Set via `VITE_APP_ID` environment variable
- **Test user**: Configure in `.env` file (not committed)

## Related Projects

- **WildwoodAPI**: `C:\Development\WildwoodAPI\Dev\WildwoodAPI\`
- **WildwoodComponents.Blazor**: `C:\Development\WildwoodAPI\Dev\WildwoodComponents.Blazor\`
- **WildwoodComponents.Razor**: `C:\Development\WildwoodAPI\Dev\WildwoodComponents.Razor\`
