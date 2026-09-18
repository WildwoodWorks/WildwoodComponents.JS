/**
 * The registration-mode resolver that replaced the copy each host site carried. The four
 * configuration combinations, the unknown-config fallback, and the invite override.
 */
import { describe, it, expect } from 'vitest';
import { resolveSignupRegistrationMode } from '@wildwood/react-shared';

const config = (allowOpenRegistration: boolean, allowTokenRegistration: boolean) => ({
  allowOpenRegistration,
  allowTokenRegistration,
});

describe('resolveSignupRegistrationMode', () => {
  it('open + token: open sign-up with the optional token entry', () => {
    expect(resolveSignupRegistrationMode(config(true, true))).toEqual({
      closed: false,
      requireToken: false,
      allowOpenRegistration: true,
      showOptionalTokenEntry: true,
      source: 'config',
    });
  });

  it('open only: open sign-up, no token card', () => {
    expect(resolveSignupRegistrationMode(config(true, false))).toEqual({
      closed: false,
      requireToken: false,
      allowOpenRegistration: true,
      showOptionalTokenEntry: false,
      source: 'config',
    });
  });

  it('token only: the token is required', () => {
    expect(resolveSignupRegistrationMode(config(false, true))).toEqual({
      closed: false,
      requireToken: true,
      allowOpenRegistration: false,
      showOptionalTokenEntry: false,
      source: 'config',
    });
  });

  it('neither: sign-up is closed', () => {
    expect(resolveSignupRegistrationMode(config(false, false))).toEqual({
      closed: true,
      requireToken: true,
      allowOpenRegistration: false,
      showOptionalTokenEntry: false,
      source: 'config',
    });
  });

  it('falls back to open sign-up plus the optional token when the settings are unknown', () => {
    const mode = resolveSignupRegistrationMode(null);
    expect(mode).toEqual({
      closed: false,
      requireToken: false,
      allowOpenRegistration: true,
      showOptionalTokenEntry: true,
      source: 'fallback',
    });
    expect(resolveSignupRegistrationMode(undefined)).toEqual(mode);
  });

  it("tokenMode 'required' forces the token path, even for a closed app", () => {
    const expected = {
      closed: false,
      requireToken: true,
      allowOpenRegistration: false,
      showOptionalTokenEntry: false,
      source: 'tokenMode',
    };
    // The server validates the invite token itself, so a closed configuration must not block it.
    expect(resolveSignupRegistrationMode(config(false, false), { tokenMode: 'required' })).toEqual(expected);
    expect(resolveSignupRegistrationMode(config(true, true), { tokenMode: 'required' })).toEqual(expected);
    expect(resolveSignupRegistrationMode(null, { tokenMode: 'required' })).toEqual(expected);
  });

  it("tokenMode 'auto' is the configuration's own answer", () => {
    expect(resolveSignupRegistrationMode(config(true, false), { tokenMode: 'auto' })).toEqual(
      resolveSignupRegistrationMode(config(true, false)),
    );
  });
});
