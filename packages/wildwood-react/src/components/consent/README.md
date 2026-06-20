# ConsentBanner (React) / ConsentComponent (React Native)

Block-before-consent cookie/consent UI backed by the `@wildwood/core` consent engine. No gated
third-party script loads until the visitor consents to its category. Honors GPC and exposes the CCPA
opt-out surfaces.

## React

```tsx
import { WildwoodProvider, ConsentBanner } from '@wildwood/react';

<WildwoodProvider client={client}>
  <ConsentBanner />
</WildwoodProvider>
```

| Prop | Default | Description |
|------|---------|-------------|
| `autoInit` | `true` | Initialize on mount (fetch config, apply decision table, inject consented scripts). |
| `showReopenLink` | `true` | Footer "Privacy choices" link to reopen preferences. |
| `showFooterOptOut` | `true` | Standalone one-click "Do Not Sell or Share" / "Limit Use of Sensitive PI" footer links. |

Use `useConsent()` to gate first-party features: `const { isGranted } = useConsent();
if (isGranted('Analytics')) { /* init analytics */ }`.

## React Native (`@wildwood/react-native`)

`ConsentComponent` ships the banner + preferences UI, consent state, and gating hook. **React Native
has no DOM and no web pixels, so the script-injection half does not apply** — native SDKs should check
`useConsent().isGranted(...)` before initializing.

**Persistence:** the core engine's first-party cookie is a no-op without a DOM, so RN consent is
session-only unless you provide a synchronous `storage` adapter to the consent options at client
creation (e.g. a sync MMKV store, or an AsyncStorage value hydrated into memory at startup). Without
one, the banner re-prompts on each launch.

```ts
const client = createWildwoodClient({ baseUrl, appId /*, consent: { storage } */ });
```

## Behavior notes (all frameworks)

- **GPC:** when honored and present, `Advertising` + `Sensitive` are forced off (even outside any geo
  target); the decision is recorded when the visitor acts.
- **Withdrawal (limitation):** `withdraw()` records a reject-all and clears the consent cookie, but
  **already-executed scripts cannot be unloaded**. Prompt a page reload after withdrawal to fully
  clear in-memory state.
- **Accessibility (web):** the preferences modal is focus-trapped while open (Tab cycles within the
  dialog; focus restored on close) and Escape-closable.
