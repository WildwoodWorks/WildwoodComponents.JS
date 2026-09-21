/**
 * Helpers for driving the Registration & Subscription component from a native test suite.
 *
 * ```ts
 * import { WW_IDS, waitForSignupStep } from '@wildwood/react-native/testing';
 * ```
 *
 * Two things live here and they are meant to be taken separately. The identifier CONSTANTS are what
 * this package renders, spelled as the web's `data-ww-*` values and Swift's identifiers spell them,
 * so a suite keys on the contract rather than on a copy of it; a Maestro flow takes only these,
 * since YAML cannot call a function. The step READERS are the part a native suite would otherwise
 * have to write itself, because a `testID` cannot be read the way `data-ww-step` can - see
 * `steps.ts`.
 *
 * **No dependency, and no peer dependency.** `@wildwood/react/testing` takes Playwright as a
 * type-only import because on the web there is one runner worth naming; here there are three that
 * agree on nothing but `testID`, so the runner is injected as a `WwDriver` the host writes over
 * whichever it uses. Nothing here loads React Native either, so the built module runs in a plain
 * Node script - its declarations still name the peer packages' types, as the package entry's do,
 * but nothing of theirs is loaded at run time.
 *
 * **Deliberately not here**: the web's `fillRegistrationForm`, `submitRegistrationForm` and
 * `dismissConsentBanner`. Each is a handful of lines whose value is entirely in what it encodes
 * about Playwright - a selector list whose order matters, an actionability wait, a banner that must
 * be answered before it eats the clicks aimed underneath it - and none of that has a native
 * counterpart. Filling the form here is one `driver.type(wwFieldTestId(field), value)` per field,
 * which a host writes better than we can guess at.
 */

export { WW_SIGNUP_STEPS, WW_MANAGE_STEPS, WW_VIEWS, WW_REGISTRATION_FIELDS, WW_IDS, type WwSignupStep } from './ids';

export type { WwDriver, WwStepReader, WwWaitOptions } from './driver';

export { currentSignupStep, waitForSignupStep, waitForSignupStepToLeave } from './steps';

// The id builders, re-exported rather than restated: the same functions the components call, so a
// `pack:` or `field:` locator built by a suite is the one that is actually on screen. They are
// exported from the package's main entry too - a host that already imports the component does not
// need this subpath to get at them.
export {
  wwTestId,
  wwPackTestId,
  wwGroupTestId,
  wwModalTestId,
  wwFieldTestId,
  type RegistrationFieldName,
} from '../components/registrationSubscription/testIds';
