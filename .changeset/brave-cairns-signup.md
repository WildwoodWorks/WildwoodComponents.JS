---
"@wildwood/react": minor
---

`AuthenticationComponent` — an `onRegisterClick` prop that hands sign-up to the host app

The login footer's "Sign up" button had exactly one behaviour: `toggleMode`, switching the
component to its own registration view. That view registers a user and nothing else, which is
wrong for any app whose signup is a larger flow — a plan-first wizard on its own route, for
instance, where `SignupWithSubscriptionComponent` collects details, confirms a tier, then
registers and subscribes atomically. Those apps got a login page with two signup doors leading to
two different outcomes, and the one inside the card was the one that skipped the plan.

```tsx
<AuthenticationComponent appId={APP_ID} onRegisterClick={() => navigate('/signup')} />
```

When supplied, the "Sign up" button calls the handler instead of switching views; the component
stays on the login form so nothing changes underneath the navigation. The button is still gated by
`allowRegistration` and the server's registration configuration, so `allowRegistration={false}`
hides it regardless of this handler.

Omitting the prop keeps today's behaviour exactly — the button still opens the built-in register
view — so nothing changes for existing apps. The register view's own "Already have an account?
Sign in" link is untouched either way.
