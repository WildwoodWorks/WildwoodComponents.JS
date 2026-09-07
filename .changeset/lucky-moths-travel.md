---
"@wildwood/react-native": minor
---

`AuthenticationComponent` — an `onRegisterClick` prop that hands sign-up to the host app

The login footer's "Sign up" link had exactly one behaviour: switch the component to its own
registration view. That is wrong for any app whose signup is a larger flow living on its own
screen, which got a login card with a second signup door leading somewhere else.

```tsx
<AuthenticationComponent appId={APP_ID} onRegisterClick={() => navigation.navigate('SignUp')} />
```

When supplied, "Sign up" calls the handler instead of switching views. The link is still gated by
`allowRegistration` and the server's registration configuration. Omitting the prop keeps today's
behaviour exactly. Matches the web component's prop of the same name.
