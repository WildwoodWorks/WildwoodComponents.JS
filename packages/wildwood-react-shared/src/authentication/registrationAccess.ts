// Shared registration gate for the web and native AuthenticationComponents.
//
// useAuthenticationLogic derives `allowRegistration` from the server's authentication
// configuration (allowOpenRegistration || allowTokenRegistration, defaulting to true while the
// config is unknown). Companion apps distributed outside the store have no self-signup and need to
// hide the sign-up affordance on the client, without turning registration off for the same app's
// web front end and without depending on the config request succeeding. The component-level
// `allowRegistration` prop is that override.

import type { AuthView } from '../hooks/useAuthenticationLogic.js';

export interface RegistrationAccess {
  /** Whether the sign-up affordance should be rendered. */
  showRegistration: boolean;
  /** The view to render: 'register' collapses to 'login' when registration is off. */
  view: AuthView;
}

/**
 * Resolves the effective registration gate.
 *
 * @param allowRegistrationProp The component's `allowRegistration` prop. When supplied it wins over
 *   the server configuration in both directions; `undefined` leaves the config in charge.
 * @param configAllowsRegistration `allowRegistration` as computed by `useAuthenticationLogic`.
 * @param view The hook's current view.
 */
export function resolveRegistrationAccess(
  allowRegistrationProp: boolean | undefined,
  configAllowsRegistration: boolean,
  view: AuthView,
): RegistrationAccess {
  const showRegistration = allowRegistrationProp ?? configAllowsRegistration;
  // Collapsing the view here (rather than rendering nothing) keeps the register view unreachable
  // even if it was already active when the prop flipped, without a state write during render.
  return {
    showRegistration,
    view: !showRegistration && view === 'register' ? 'login' : view,
  };
}
