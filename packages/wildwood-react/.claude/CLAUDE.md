# @wildwood/react

Thin React wrapper over @wildwood/core. Provides hooks and pre-built components.

## Key Files

- `src/provider/WildwoodProvider.tsx` - Creates WildwoodClient, provides via context
- `src/hooks/useAuth.ts` - Reactive auth state + methods
- `src/components/authentication/AuthenticationComponent.tsx` - Full multi-view auth component
- `src/index.ts` - Barrel export

## Conventions

- Hooks wrap core services with React state (useState, useEffect, useCallback)
- Components use `ww-` CSS class prefix
- peerDeps: react 18/19, @wildwood/core
- External: react, react/jsx-runtime, @wildwood/core (not bundled)

## Feature Parity

Components mirror WildwoodComponents.Blazor components. See parity table in root `.claude/CLAUDE.md`.
