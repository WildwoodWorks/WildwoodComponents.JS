---
"@wildwood/react-native": minor
---

The identifier contract reaches the registration form, the disclaimers and consent — and two sheet
ids are RENAMED

One test plan is meant to drive all five stacks — `data-ww-*` on the web, `accessibilityIdentifier`
on Swift, `testID` here — and an audit found React Native missing a set of hooks the other stacks
already carry. **Read the rename first: this release is not purely additive.**

**Renamed, and the old spellings stop working.** The pack picker's sheet was `packs-modal` and the
card sheet was `payment-modal`; they are now `modal:packs` and `modal:payment`, which is what Swift
emits and what the web's `data-ww-modal="packs" | "payment"` says. A host locating either sheet by
its old id finds nothing and must update. The prefix is not decoration: `packs` and `payment` are
both step names this flow reports, and a surface can have a sheet up while one of them is running,
so unprefixed ids would put two elements with different jobs behind one string. Built through the
new `wwModalTestId`, so the prefix is spelled in one place. The packs sheet's own Continue keeps
`packs-modal-continue` — it is a button inside a sheet rather than a sheet, no other stack has a
counterpart for it, and moving it into the `modal:` namespace would assert a third sheet by that
name.

**The registration form can be driven at all.** Its inputs carried nothing but English placeholders,
so a native signup test could not be written and would have broken the first time the form was
localised. The six inputs now carry the web's `data-ww-field` names — `field:firstName`,
`field:lastName`, `field:username`, `field:email`, `field:password`, `field:confirmPassword` —
alongside `field:registrationToken` on the token entry (both of its placements; they are the same
field in two mutually exclusive steps) and `submit-register`, the web's `data-ww-action` value, on
the submit. Namespaced for the reason every prefix in this package is: the prefix is the web
attribute's own name, and `data-ww-field` is an attribute of its own there. None of the seven
collides with a step id today — that was checked, not assumed — but fields and steps are two
vocabularies that grow independently in one flat namespace, and a future field called `plan` or
`payment`, or a step called `email`, would collide silently. `wwFieldTestId` is exported with them.

**The disclaimers can be accepted.** `DisclaimerComponent`'s controls carried neither a `testID` nor
an `accessibilityLabel`, so there was no way to drive acceptance on React Native. They now carry
Swift's spellings: `disclaimer-retry`, `disclaimer-accept` (once per pending disclaimer, as on the
web — the id names the role) and `disclaimer-accept-all`.

**Four more hooks Swift already had**, spelled identically: `add-packs` on the control that opens the
pack picker, and `plan-change-notice` (on both the progress and the alert shapes), `plan-change-retry`
and `plan-change-dismiss` on the plan-change notice.

**The consent banner names itself.** `consent-banner` on the banner and `consent-accept-all` on its
accept-all. The banner had only `accessibilityLabel="Cookie consent"`, which is accessibility copy
meant to be translated and so cannot be a locator.

**The manage view reports `idle`.** It mapped the plan-change flow's resting step to no step id at
all, while the web emits `data-ww-step="idle"` unconditionally. `idle` is a string of its own rather
than a repeat of the view's name, so reporting it makes nothing ambiguous, and swallowing it left a
suite unable to tell "no change is running" from "this build carries no step hook". The signup
view's behaviour at rest is unchanged: its `signedIn` body genuinely has no step to report.
