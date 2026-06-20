# Consent Management (`@wildwood/core`)

Block-before-consent cookie/consent engine. No gated third-party script loads until the visitor
consents to its category. Honors the Global Privacy Control (GPC) signal and exposes the CCPA
opt-out surfaces. Backed by the WildwoodAPI public endpoints `GET /api/consent/config` and
`POST /api/consent/record` plus the per-App Third-Party Script registry.

## Core usage

```ts
import { createWildwoodClient } from '@wildwood/core';

const client = createWildwoodClient({ baseUrl: 'https://api.wildwoodworks.io', appId: 'my-app' });

const { config, state, shouldShowBanner } = await client.consent.initialize();
// On page load the engine has already: fetched config + script registry, read the ww_consent
// cookie + GPC, applied the show/suppress decision table, and injected StrictlyNecessary + any
// previously-consented scripts. No Analytics/Advertising/etc. script has fired yet.

if (shouldShowBanner) {
  // render your banner; then on the visitor's choice:
  await client.consent.acceptAll();                 // grants all active categories
  await client.consent.rejectAll();                 // only StrictlyNecessary
  await client.consent.setCategories({ Analytics: true }); // custom
}

client.consent.isGranted('Analytics'); // gate first-party features on consent
client.consent.onConsentChange((s) => console.log('consent changed', s.categories));
```

## Behavior

- **Block-before-consent:** gated scripts (from feature 2's registry) inject only after the matching
  category is consented to. `StrictlyNecessary` may load immediately.
- **GPC:** when `honorGpc` is on and `navigator.globalPrivacyControl` is true, `Advertising` and
  `Sensitive` are forced opted-out and the decision is recorded with method `Gpc` — even outside any
  geo target.
- **Geo-aware:** when enabled, the banner shows only to visitors whose resolved geo tags match the
  App's target list (country-level by default). Non-target visitors get the configured non-target
  default (`LoadAll` or `NecessaryOnly`); GPC is still honored.
- **Versioning:** the consent cookie stores the `ConfigVersion`. When the App's config version is
  bumped, stored consent is treated as stale and the visitor re-prompts.
- **Withdrawal:** stops future injection and clears SDK cookies. Already-executed scripts cannot be
  unloaded — prompt a page reload to fully clear in-memory state.

## Framework wrappers

- **React:** `import { ConsentBanner, useConsent } from '@wildwood/react'`.
- **React Native:** `import { ConsentComponent, useConsent } from '@wildwood/react-native'` — UI +
  consent-state + gating only; **no DOM, no script injection** (native SDKs check `useConsent` before
  initializing).
- **Blazor:** `WildwoodComponents.Blazor` `ConsentBanner` component (loads the engine via JS isolation).
