---
"@wildwood/core": minor
"@wildwood/react-shared": minor
"@wildwood/react": minor
"@wildwood/react-native": minor
---

Campaign Attribution: funnel tracking and registration funnel events

`client.attribution` now keeps a 30-minute funnel session and, when the app turns funnel tracking on in
WildwoodAdmin, sends batched events to `POST /api/attribution/events`: `page_view` for the landing page
and SPA navigations, `scroll_depth`, `engaged`, `time_on_page` and `cta_click` for elements marked
`data-ww-cta`, each behind its own config switch. New API: `track(name, { label, value, path })`,
`trackCta(label)` and `flush()`. The `path` option lets a host with no URL (React Native) name the
screen; a `page_view` with a path becomes the current page. Registration payloads now carry the
`sessionKey`, `deviceClass` and `sessionCount`, and the attribution options accept `getDeviceClass`. An
opt-in `sessionStorage` mirror keeps the touch and session across a reload before the consent decision.
`HttpClient.resolveUrl(path)` returns the absolute URL of an API path (used for `sendBeacon`).

The registration components report the signup funnel on their own: `signup_view`, `signup_start`,
`signup_submit` and `signup_error` (a fixed category such as `email_taken` or `password_policy`, never
the visitor's input or the server's message) from `TokenRegistrationComponent`, and `plan_selected` and
`checkout_start` from the shared signup flow. `useSignupFunnel`, `signupErrorCategory` and
`signupPlanKey` are exported for custom forms.

```ts
const { track, trackCta, flush } = useAttribution();
```

React Native: `WildwoodProvider` reports a device class from the window's shortest side (600 points or
more is a tablet) and flushes queued events when the app is backgrounded; `useAttributionScreen(name)`
records a screen's `page_view`. Nothing is sent until the app enables funnel tracking.
