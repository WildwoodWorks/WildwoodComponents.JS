import { describe, it, expect } from 'vitest';
import { resolveRegistrationAccess } from '@wildwood/react-shared';

// AuthenticationComponent's `allowRegistration` prop is applied through this resolver. This package
// has no React renderer (no react-dom / @testing-library), so the gate is exercised here as the
// pure function the component calls; the rendered behaviour is covered in @wildwood/react.

describe('resolveRegistrationAccess', () => {
  it('follows the server configuration when the prop is omitted', () => {
    expect(resolveRegistrationAccess(undefined, true, 'login').showRegistration).toBe(true);
    expect(resolveRegistrationAccess(undefined, false, 'login').showRegistration).toBe(false);
  });

  it('lets a false prop deny registration the configuration allows', () => {
    expect(resolveRegistrationAccess(false, true, 'login').showRegistration).toBe(false);
  });

  it('lets a true prop allow registration the configuration denies', () => {
    expect(resolveRegistrationAccess(true, false, 'login').showRegistration).toBe(true);
  });

  it('collapses the register view to login when registration is off', () => {
    expect(resolveRegistrationAccess(false, true, 'register').view).toBe('login');
    expect(resolveRegistrationAccess(undefined, false, 'register').view).toBe('login');
  });

  it('leaves the register view alone when registration is on', () => {
    expect(resolveRegistrationAccess(true, false, 'register').view).toBe('register');
    expect(resolveRegistrationAccess(undefined, true, 'register').view).toBe('register');
  });

  it('passes every other view through untouched', () => {
    for (const view of ['twoFactor', 'passwordReset', 'forgotPassword', 'disclaimers'] as const) {
      expect(resolveRegistrationAccess(false, false, view).view).toBe(view);
    }
  });
});
