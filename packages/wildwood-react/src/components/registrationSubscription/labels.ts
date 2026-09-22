// The component's copy now lives in `@wildwood/react-shared`, so React Native says the same words.
// This module keeps the names the rest of this package imports, and the path the tests import them
// from, so nothing here had to move with it.

export {
  DEFAULT_REGISTRATION_SUBSCRIPTION_LABELS as DEFAULT_LABELS,
  formatRegistrationSubscriptionLabel as formatLabel,
  resolveRegistrationSubscriptionLabels as resolveLabels,
} from '@wildwood/react-shared';
export type { RegistrationSubscriptionLabels } from '@wildwood/react-shared';
