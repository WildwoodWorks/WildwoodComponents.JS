---
"@wildwood/react-native": minor
---

The Registration & Subscription views keep their test hooks when a host names its own mount

A test plan for these views is meant to read the same against every stack — `data-ww-view` and
`data-ww-step` on the web, `accessibilityIdentifier` on Swift, `testID` here. React Native gives an
element one `testID` where the web gives it a bag of attributes, and three answers were sharing that
one attribute and overwriting each other. Four fixes. No string changed its meaning and none was
withdrawn, so a suite that locates by these ids and asserts on what it finds inside them still
passes. What did change is which ELEMENT answers to a bare id: `register` and `signup` used to land
on the scroll view itself, and now land on elements nested inside it. A suite asserting presence or
content is unaffected; one that scrolled the element it found, or read `contentContainerStyle` off
it, is now looking at the wrong element and needs to walk out to the host's own frame.

**A host's `testID` no longer replaces the step hook.** `<RegistrationSubscriptionSignup
testID="checkout-signup" />` is the natural thing to write on a screen holding more than one Wildwood
surface, and it used to swap the step for that constant — so a suite waiting for `payment` waited
until it timed out, a failure that reads as a component hanging rather than as a locator that moved.
The host's id now sits on the view's outermost element and the hooks keep their own elements beneath
it. The minor bump is for that move: a host asserting on what is INSIDE its own `testID` still finds
everything, but one that expected the id on the scroll view itself is now one element out.

**A store-billed device reports `payment` like every other stack.** The signup's two store bodies
(`storePayment`, `storeUnavailable`) were reported as step ids of their own, and neither the web nor
Swift has such a step — so on a phone the app bills through the App Store, `payment` was never
emitted at all. The step is now the portable one, and the store variant is named beside it rather
than instead of it: `store-payment` or `store-unavailable` on the payment step's own frame, and
nothing on the card path, where `payment` already says everything.

**Each view names itself in every body, running ones included.** The view's name (`signup`,
`manage`, `pricing`) used to appear only while nothing was happening, because the step took its place
on the root. Generic ids like `payment`, `failed` and `loading` were therefore unscoped on a screen
hosting two Wildwood surfaces. The name now has an element of its own that is always present, and it
encloses the step rather than sitting beneath it — the same way the web nests `data-ww-step` inside
`data-ww-view`. That order is what makes the name useful: step ids are bare, so
`within(getByTestId('signup')).getByTestId('payment')` is how two surfaces are told apart, and it only
reaches the step while the view is its ancestor.

**`wwTestId`, `wwPackTestId` and `wwGroupTestId` are exported.** A host could not build a `pack:<id>`
selector without hardcoding the prefix, which is a selector that drifts the day the prefix changes.
Swift's equivalents are already `public`.
