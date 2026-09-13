---
"@wildwood/core": minor
"@wildwood/react-shared": minor
"@wildwood/react": minor
"@wildwood/react-native": minor
---

Campaign Attribution: tie every signup to the ad or link that brought it

`client.attribution` reads the UTM tags, an ad-platform click id and the referring site from the
landing URL, keeps a first and a last touch, and attaches them to `register`, `registerWithToken` and
`registerOpen`. Provider sign-ins queue a claim that is sent once the session is signed in. The touches
are persisted under `ww_attribution` only once the app's consent category (Analytics by default) is
granted; until then they live in memory, which still covers a visitor who lands on an ad and signs up in
the same visit. An optional anonymous landing beacon feeds visits and conversion into the WildwoodAdmin
Campaign Attribution report.

```ts
const { touch, isPersisted, getForRegistration } = useAttribution();
```

Nothing changes until the app enables Campaign Attribution in WildwoodAdmin: with it off, the config says
so and the SDK captures, persists and sends nothing. `WildwoodProvider` (React and React Native) starts
capture on mount; React Native also captures launch and runtime deep links. `ConsentService.initialize()`
now notifies `onConsentChange` subscribers once the restored or defaulted state is known.
