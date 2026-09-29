# Campaign Attribution (`@wildwood/core`)

First-party campaign attribution. The SDK reads the UTM tags, an ad-platform click id and the
referring site from the landing URL, keeps a first and a last touch, and attaches them to every
signup, so each new account is tied to the ad or link that brought it. No third-party pixel is
involved. Backed by the WildwoodAPI public endpoints `GET /api/attribution/config`,
`POST /api/attribution/touch`, `POST /api/attribution/events` and `POST /api/attribution/claim`,
and switched on per App in WildwoodAdmin (Components, then Campaign Attribution). Reports live under
Analytics, then Campaign Attribution. The feature is gated on the `ATTRIBUTION_TRACKING` tier feature.

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

## Funnel tracking

With funnel tracking on, the SDK also records what a visitor does between landing and signing up, so
the Campaign Attribution report can show where each campaign's visitors drop off. Events go to the
anonymous `POST /api/attribution/events` endpoint in batches of at most 25: every 5 seconds while
events are queued, and by `sendBeacon` (or a keepalive fetch) when the page is hidden or unloads.

Every switch lives in WildwoodAdmin (Components, then Campaign Attribution), and nothing is sent until
the App's config says so:

| Setting | What it turns on |
| --- | --- |
| Funnel tracking | The session key, `page_view` and `track()`. Off, every event is dropped. |
| Track scroll depth | `scroll_depth` at 25, 50, 75 and 100 percent, once per page. |
| Track engagement | `engaged` once per session (half the page scrolled, or an interaction plus 10 seconds visible) and `time_on_page` in visible seconds. |
| Auto-track CTA clicks | `cta_click` for clicks on elements marked `data-ww-cta`. |
| Track signup steps | `signup_view`, `signup_start`, `signup_submit` and `signup_error`. |
| Custom event names | Extra names (`^[a-z0-9_]{1,40}$`) your code may send on top of the standard ones. |

On the web the auto listeners also record a `page_view` for the landing page and for every SPA
navigation (`history.pushState`, `replaceState` and `popstate`), once per path. A session ends after 30
minutes without activity. Each registration carries the session key, the device class (`mobile`,
`tablet` or `desktop`) and the visitor's session count, which joins the new account to its funnel.

Mark a call to action with `data-ww-cta` and its value becomes the `cta_click` label:

```html
<a href="/signup" data-ww-cta="hero_start_trial">Start your free trial</a>
```

Track anything else from code. Calls made before the config loads are buffered and replayed, a name the
App does not allow is dropped, and nothing ever throws:

```ts
client.attribution.track('demo_booked', { label: 'pricing_page', value: 1 }); // a configured custom name
client.attribution.trackCta('nav_pricing'); // a cta_click with this label
client.attribution.track('page_view', { path: '/pricing' }); // a host with no URL (React Native)
await client.attribution.flush(); // send the queue now, before a hard navigation
```

Labels are trimmed and capped at 100 characters. A `path` option drops any query string or fragment and
gets a leading `/`; a `page_view` with a path also becomes the current page, so later events carry it.
`signup_complete`, `trial_started` and `purchase` are recorded by the server when they happen, so a
client call with one of those names is dropped.

## Registration funnel events

The registration components report the signup steps on their own, so an app that uses them needs no code.

| Event | When | Label |
| --- | --- | --- |
| `signup_view` | The registration form first renders. | none |
| `signup_start` | The first focus on any registration field (or the submit, for an autofilled form). | none |
| `signup_submit` | The account form is submitted, before the request goes out. | none |
| `signup_error` | A client check or the server refuses the registration. | a category (below) |
| `plan_selected` | A plan is chosen on the plan step. | the tier id |
| `checkout_start` | The payment step opens for a paid plan. | the pricing option id (else the tier id) |

`signup_error` carries a category, never what the visitor typed or the server's message:
`validation`, `email_taken`, `username_taken`, `password_policy`, `captcha`, `invalid_token`,
`registration_closed`, `rate_limited`, `network`, `server` or `unknown`. The category comes from the
server's `errorCode` (for example `USERNAME_EXISTS` or `PASSWORD_INVALID`), then the HTTP status. The
view, start, submit, plan and checkout events go out once per session (per plan for the last two), so
stepping back through the flow never counts a step twice. A custom registration form can report the
same steps with `useSignupFunnel()` from `@wildwood/react` or `@wildwood/react-native`, and map its own
errors with `signupErrorCategory(error)`.

## Pre-consent session persistence

Until the visitor decides on consent, touches live in memory only, so a reload loses them. When the App
turns on "Session storage before consent", the SDK mirrors the visitor key, the funnel session and the
first and last touch to `sessionStorage` under `ww_attribution_session` while the visitor is undecided.
The mirror belongs to the tab and ends when the tab closes. It is removed when consent is granted (the
data moves to `ww_attribution`), when the visitor declines or withdraws consent (and no new mirror is
written for the rest of that page load), and on `clear()`. It holds nothing beyond the touch and the two
anonymous keys.

## Framework wrappers

- **React:** `WildwoodProvider` starts capture; `import { useAttribution } from '@wildwood/react'` reads the
  state (`state`, `touch`, `isPersisted`, `captureUrl`, `getForRegistration`, `clear`) and sends funnel
  events (`track`, `trackCta`, `flush`). The callbacks are stable across renders.

  ```tsx
  const { trackCta } = useAttribution();
  <button onClick={() => trackCta('pricing_compare')}>Compare plans</button>;
  ```

- **React Native:** `WildwoodProvider` also captures `Linking.getInitialURL()` and later `url` events,
  labels payloads with `Platform.OS`, reports a device class from the window's shortest side (600 points
  or more is a tablet), and flushes queued events when the app goes to the background or inactive
  (there is no `sendBeacon`). A host's own `attribution.platform` or `attribution.getDeviceClass` in the
  provider config wins. There is no DOM, so the scroll, engagement and CTA listeners do not run; screens
  say where the visitor is instead:

  ```tsx
  import { useAttributionScreen } from '@wildwood/react-native';

  function PricingScreen() {
    useAttributionScreen('pricing'); // a page_view with path "/pricing" on mount
    // ...
  }
  ```

  `useAttributionScreen` runs on mount and when the name changes. With a navigator that keeps screens
  mounted, call `trackScreenView(client.attribution, 'pricing')` from its focus listener (for example
  React Navigation's `useFocusEffect`) so a return to the screen counts too. Storage defaults to memory,
  so touches survive a relaunch only when the host passes a storage adapter.
- **Blazor:** add `<AttributionBootstrap AppId="..." />` to the layout; the registration components attach
  the payload.
- **Swift:** `client.attribution.capture(url:referrer:)` from `.onOpenURL`; registration carries the payload.

## Server-side conversions

Conversions can also be sent to the ad platforms from the server, so a campaign is credited even when a
browser blocks their pixels. Configure them in WildwoodAdmin under Campaign Attribution, then
Conversion destinations: Reddit, Meta, Google, Microsoft, LinkedIn, TikTok and X are supported. The
server reports signups, trials and purchases using the click id captured with the touch (for example
`rdt_cid`, `fbclid` or `gclid`). No SDK code is needed: the registration payload already carries what
the server uses.

## Privacy

- Funnel events carry no personal data: an event name, a label, an optional number, the page path
  (never a query string), the anonymous visitor and session keys, the device class and the current
  touch. Keep labels you send yourself free of names, emails and free text.
- Error labels are fixed categories, never the visitor's input or a server message.
- A conversion destination sends a hashed email to an ad platform only when the admin opts in for that
  destination. The hashing happens on the server; the SDK never sends or hashes an email for
  attribution.
- Nothing is written to `localStorage` before the App's consent category is granted, and the optional
  `sessionStorage` mirror above ends with the tab.

## Tagging links

Keep the taxonomy stable and lowercase: `utm_source` is the platform (`reddit`, `linkedin`), `utm_medium`
the channel (`paid`, `social`, `email`), `utm_campaign` the campaign (`govcon-test-sep26`) and `utm_content`
the creative (`ad1`). The report groups exact strings, so build links from one shared sheet.
