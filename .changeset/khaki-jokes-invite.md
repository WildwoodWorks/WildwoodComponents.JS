---
"@wildwood/react-native": minor
---

`useExpoProviderSignIn` — one reusable Expo implementation of the social sign-in seam

`AuthenticationComponent`'s `onProviderSignIn` prop has always been the app's job to fill in, so
every Wildwood Expo app wrote the same expo-auth-session / expo-apple-authentication dance. The new
hook returns that callback:

```tsx
const onProviderSignIn = useExpoProviderSignIn({
  scheme: 'gcm',
  google: { iosClientId: '…', androidClientId: '…', webClientId: '…' },
  microsoft: { clientId: '…' },
  apple: true,
});

<AuthenticationComponent appId={APP_ID} onProviderSignIn={onProviderSignIn} />
```

Google and Microsoft run an `AuthRequest` against the provider's static discovery document (no
`useAutoDiscovery` round-trip — the callback runs on a tap and cannot call a hook), asking for an
id_token with a per-request nonce and falling back to the authorization code when a provider is
configured to return one. Apple runs the native expo-apple-authentication sheet and returns the
identity token. Provider names are matched the way the component's icons are — normalized substrings,
so `Microsoft`, `MicrosoftAccount`, `AzureAD` and `Entra` all route the same way.

Cancelling (a dismissed browser session, or Apple's `ERR_REQUEST_CANCELED`) resolves `null`, which
the component treats as "no sign-in happened". Everything else rejects with a message the component
renders in its error banner, naming the package to install or the client id to configure.

`expo-auth-session`, `expo-web-browser` and `expo-apple-authentication` are new OPTIONAL peer
dependencies, loaded lazily like `expo-iap`: an app with no social providers installs none of them
and needs no native rebuild.
