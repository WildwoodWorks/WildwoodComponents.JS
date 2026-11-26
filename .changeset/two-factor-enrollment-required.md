---
"@wildwood/core": minor
"@wildwood/react-shared": minor
"@wildwood/react": minor
"@wildwood/react-native": minor
"@wildwood/node": minor
---

Support the API's "2FA required" policy: a user without a second factor on an app that requires one
gets a restricted session until they enroll.

- core: `requiresTwoFactorEnrollment` on auth responses; `session.isTwoFactorEnrollmentPending`,
  `session.completeTwoFactorEnrollment()`; events `twoFactorEnrollmentRequired` /
  `twoFactorEnrollmentCompleted`; a 403 `TWO_FACTOR_ENROLLMENT_REQUIRED` becomes
  `WildwoodError.code === 'TwoFactorEnrollmentRequired'` and never triggers a refresh or sign-out.
- react / react-native: `AuthenticationComponent` holds the user on two-factor setup (view
  `twoFactorEnrollment`) and reports success only after enrollment; enrolling through
  `TwoFactorSettingsComponent` refreshes the session; new `useTwoFactorEnrollmentRequired()` hook.
- node: `createAuthMiddleware` refuses enrollment-restricted tokens with the same 403 unless
  `allowTwoFactorEnrollmentPending: true`; `wildwoodUser.twoFactorEnrollmentPending`.
