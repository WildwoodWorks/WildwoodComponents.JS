# Campaign Attribution (`@wildwood/core`)

First-party campaign attribution. The SDK reads the UTM tags, an ad-platform click id and the
referring site from the landing URL, keeps a first and a last touch, and attaches them to every
signup, so each new account is tied to the ad or link that brought it. No third-party pixel is
involved. Backed by the WildwoodAPI public endpoints `GET /api/attribution/config`,
`POST /api/attribution/touch` and `POST /api/attribution/claim`, and switched on per App in
WildwoodAdmin (Components, then Campaign Attribution). Reports live under Analytics, then Campaign
Attribution. The feature is gated on the `ATTRIBUTION_TRACKING` tier feature.

## Core usage

Most apps need no code: `WildwoodProvider` starts capture on mount and every registration path
attaches the payload. Without a provider:

```ts
import { createWildwoodClient } from '@wildwood/core';

const client = createWildwoodClient({ baseUrl: 'https://api.wildwoodworks.io', appId: 'my-app' });

// Call once, as early as possible: the landing URL is read synchronously, before anything awaits.
await client.attribution.initialize();

client.attribution.getState(); // { visitorKey, first, last, persisted, config }
client.attribution.getForRegistration(); // the payload register* requests carry, or null
client.attribution.captureUrl('myapp://signup?utm_source=newsletter'); // deep links, SPA navigations
client.attribution.onChange((state) => console.log('attribution', state.last));

// Registration attaches it automatically; pass `attribution: null` to send none.
await client.auth.register({ email, firstName, lastName, password, appId: 'my-app' });
```

## Behavior

- **What is captured:** `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`; the first
  well-formed click id among `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`,
  `twclid`, `rdt_cid`; the referrer's host (never its path or query); the landing host and path; and
  any extra parameters the App allowlists. Source and medium are lowercased. Values are trimmed and
  capped, and a value carrying control characters is dropped. The server normalizes everything again.
- **Referrals and direct visits:** with no UTM tags, an external referrer becomes
  `{ source: <host>, medium: 'referral' }`. Self-referrals are ignored, and a direct visit never
  overwrites the stored last touch.
- **First and last touch:** the first touch is kept for the App's attribution window (30 days by
  default); a first touch older than the window resets both.
- **Consent-gated persistence:** the touches are held in memory and written to storage under
  `ww_attribution` only once the App's persistence consent category (Analytics by default) is granted
  through the consent engine. While the visitor has not decided, they stay in memory and are written
  when consent is granted; if the visitor declines or withdraws consent, any stored blob is removed. A same-visit signup
  (land on an ad, sign up) is attributed either way.
- **Landing beacon:** when the App turns the beacon on, one anonymous touch is posted per landing so the
  report can show visits and conversion per campaign. No IP address is stored, and only the click id's
  name is kept.
- **Registration:** `register`, `registerWithToken` and `registerOpen` carry the payload and clear it on
  success. Provider sign-ins (OAuth) queue a claim that is sent once the session is signed in, including
  after two-factor or pending disclaimers; the server records it only for an account created within the
  last 15 minutes.
- **Failure:** attribution never throws into the app and never fails a signup. If the config request
  fails, touches are still captured in memory and sent with registration, but nothing is persisted.

## Framework wrappers

- **React:** `WildwoodProvider` starts capture; `import { useAttribution } from '@wildwood/react'` reads the
  state (`state`, `touch`, `isPersisted`, `captureUrl`, `getForRegistration`, `clear`).
- **React Native:** `WildwoodProvider` also captures `Linking.getInitialURL()` and later `url` events and
  labels payloads with `Platform.OS`. Storage defaults to memory, so touches survive a relaunch only when
  the host passes a storage adapter.
- **Blazor:** add `<AttributionBootstrap AppId="..." />` to the layout; the registration components attach
  the payload.
- **Swift:** `client.attribution.capture(url:referrer:)` from `.onOpenURL`; registration carries the payload.

## Tagging links

Keep the taxonomy stable and lowercase: `utm_source` is the platform (`reddit`, `linkedin`), `utm_medium`
the channel (`paid`, `social`, `email`), `utm_campaign` the campaign (`govcon-test-sep26`) and `utm_content`
the creative (`ad1`). The report groups exact strings, so build links from one shared sheet.
