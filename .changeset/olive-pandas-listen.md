---
"@wildwood/react-native": minor
"@wildwood/react": minor
"@wildwood/react-shared": minor
---

`AuthenticationComponent` — an `allowRegistration` prop that overrides the server config

Both the web and native `AuthenticationComponent`s decided whether to offer sign-up purely from the
app's authentication configuration (`allowOpenRegistration || allowTokenRegistration`, defaulting to
allowed while the config is still unknown). Companion apps — unlisted App Store builds with no
self-signup — need the sign-up affordance gone on the client only: turning registration off in the
config would hide it on the same app's web front end too, and a config request that fails offline
falls open.

```tsx
<AuthenticationComponent appId={APP_ID} allowRegistration={false} />
```

`false` hides the sign-up link and collapses the registration view back to login, so the view is
unreachable however it was entered. `true` shows it even when the configuration denies registration.
Omitting the prop keeps today's config-driven behaviour, so nothing changes for existing apps.

The gate itself ships from `@wildwood/react-shared` as `resolveRegistrationAccess(prop, configValue,
view)`, which both components call.
