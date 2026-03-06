# @wildwood/core

Pure TypeScript SDK with zero UI dependencies. Runs in browser and Node.js 18+.

## Key Files

- `src/client/WildwoodClient.ts` - Main entry point, factory function
- `src/client/httpClient.ts` - fetch wrapper with auth headers, timeout, interceptors
- `src/auth/authService.ts` - Login, register, OAuth, passkeys, 2FA, password reset
- `src/auth/sessionManager.ts` - Token storage, auto-refresh at 80%, sliding expiration
- `src/index.ts` - Barrel export (public API)

## Conventions

- **Zero dependencies** - only native fetch, no Axios
- **StorageAdapter pattern** - pluggable storage (localStorage, memory, custom)
- **Typed EventEmitter** - events: authChanged, sessionExpired, tokenRefreshed, themeChanged, error
- All service methods return Promises
- Enum values match WildwoodAPI C# enums (numeric values)
- Storage keys prefixed `ww_`

## Feature Parity

This package ports services from `WildwoodComponents.Blazor/Services/`. See the parity table in the root `.claude/CLAUDE.md`.
