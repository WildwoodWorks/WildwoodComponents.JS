// How a signup screen may offer registration, read from the app's live Wildwood authentication
// settings so the screen offers exactly what the server will accept:
//
//   open + token registration -> open sign-up, plus the optional "Have a registration token?" card
//   open registration only    -> open sign-up, no token card
//   token registration only   -> the token step is required
//   neither                   -> sign-up is closed
//
// When the settings can't be read (network error, older API), fall back to open sign-up with the
// optional token card. The server still enforces its own settings, so the fallback can only offer a
// path that is refused with a clear message, never grant one the server wouldn't.
//
// This replaces the copy of `registrationModeFor` that each host site carried.

import type { AuthenticationConfiguration } from '@wildwood/core';

/**
 * Whether the visitor is signing up freely or redeeming an invite.
 *
 * - `'auto'` follows the app's configuration (the host sites' original behaviour).
 * - `'required'` is invite redemption: the visitor arrived with a token, so the token step is the
 *   only way in regardless of what the configuration says.
 */
export type SignupTokenMode = 'auto' | 'required';

/** The registration paths a signup screen may offer, and where the answer came from. */
export interface SignupRegistrationMode {
  /** No registration path is open: render the "sign-up is closed" panel. */
  closed: boolean;
  /** A registration token must be supplied before an account can be created. */
  requireToken: boolean;
  /** Anyone may sign up without a token. */
  allowOpenRegistration: boolean;
  /** Offer the optional "Have a registration token?" entry alongside open sign-up. */
  showOptionalTokenEntry: boolean;
  /**
   * `'config'` — decided by the app's live settings.
   * `'fallback'` — the settings could not be read, so open sign-up plus the optional token entry.
   * `'tokenMode'` — the caller asked for invite redemption, which overrides the settings.
   */
  source: 'config' | 'fallback' | 'tokenMode';
}

export interface ResolveSignupRegistrationModeOptions {
  /** Defaults to `'auto'`. */
  tokenMode?: SignupTokenMode;
}

/** The two flags the decision reads. Any object carrying them will do. */
export type SignupRegistrationSettings = Pick<
  AuthenticationConfiguration,
  'allowOpenRegistration' | 'allowTokenRegistration'
>;

/**
 * Resolve how a signup screen should offer registration.
 *
 * @param config The app's authentication configuration, or `null` while it is unknown.
 * @param options `tokenMode: 'required'` forces the token path — the visitor is redeeming an invite,
 *   and the server validates the token itself, so a closed configuration does not block it.
 */
export function resolveSignupRegistrationMode(
  config: SignupRegistrationSettings | null | undefined,
  options: ResolveSignupRegistrationModeOptions = {},
): SignupRegistrationMode {
  // Invite redemption wins over everything: the link carries a token the server will validate, and
  // an app that has turned open registration off still honours its own invitations.
  if (options.tokenMode === 'required') {
    return {
      closed: false,
      requireToken: true,
      allowOpenRegistration: false,
      showOptionalTokenEntry: false,
      source: 'tokenMode',
    };
  }

  const source = config ? 'config' : 'fallback';
  const open = config ? Boolean(config.allowOpenRegistration) : true;
  const token = config ? Boolean(config.allowTokenRegistration) : true;

  if (open) {
    return {
      closed: false,
      requireToken: false,
      allowOpenRegistration: true,
      showOptionalTokenEntry: token,
      source,
    };
  }
  if (token) {
    return {
      closed: false,
      requireToken: true,
      allowOpenRegistration: false,
      showOptionalTokenEntry: false,
      source,
    };
  }
  return {
    closed: true,
    requireToken: true,
    allowOpenRegistration: false,
    showOptionalTokenEntry: false,
    source,
  };
}
