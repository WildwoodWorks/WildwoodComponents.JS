import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AuthenticationConfiguration, WildwoodClient } from '@wildwood/core';
import { AuthenticationComponent } from '../components/authentication/AuthenticationComponent.js';
import { createTestClient, createWrapper } from './testUtils.js';

/** Only the two registration flags matter here; the rest is filler the component ignores. */
const config = (over: Partial<AuthenticationConfiguration> = {}): AuthenticationConfiguration =>
  ({
    isEnabled: true,
    defaultProvider: '',
    allowLocalAuth: true,
    requireEmailVerification: false,
    allowPasswordReset: false,
    showDetailedErrors: true,
    allowTokenRegistration: false,
    allowOpenRegistration: false,
    requireEmailVerificationForOpenRegistration: false,
    hasEmailConfiguration: false,
    registrationRateLimitPerHour: 0,
    registrationRateLimitPerDay: 0,
    registrationRateLimitPerIpPerHour: 0,
    passwordMinimumLength: 8,
    passwordRequireDigit: false,
    passwordRequireLowercase: false,
    passwordRequireUppercase: false,
    passwordRequireSpecialChar: false,
    passwordHistoryLimit: 0,
    passwordExpiryDays: 0,
    ...over,
  }) as AuthenticationConfiguration;

function clientWithConfig(authConfig: AuthenticationConfiguration): WildwoodClient {
  const client = createTestClient();
  client.auth.getAuthenticationConfiguration = vi.fn().mockResolvedValue(authConfig);
  client.auth.getCaptchaConfiguration = vi.fn().mockResolvedValue(null);
  client.auth.getAvailableProviders = vi.fn().mockResolvedValue([]);
  return client;
}

const signUpLink = () => screen.queryByRole('button', { name: /^Sign up$/i });

/**
 * Both gates default to "allowed" until the configuration lands, so an assertion made too early
 * passes for the wrong reason. Every `config()` here denies password reset, and that link is only
 * hidden once the config is applied — waiting for it to go proves the config reached the render.
 */
const configApplied = () =>
  waitFor(() => expect(screen.queryByRole('button', { name: /Forgot your password/i })).toBeNull());

describe('AuthenticationComponent allowRegistration prop', () => {
  it('follows the server configuration when the prop is omitted', async () => {
    const client = clientWithConfig(config({ allowOpenRegistration: true }));

    render(<AuthenticationComponent appId="test-app-id" />, { wrapper: createWrapper(client) });

    await configApplied();
    expect(signUpLink()).toBeTruthy();
  });

  it('hides the sign-up link when the prop is false even though the config allows registration', async () => {
    const client = clientWithConfig(config({ allowOpenRegistration: true, allowTokenRegistration: true }));

    render(<AuthenticationComponent appId="test-app-id" allowRegistration={false} />, {
      wrapper: createWrapper(client),
    });

    await configApplied();
    expect(signUpLink()).toBeNull();
  });

  it('shows the sign-up link when the prop is true even though the config denies registration', async () => {
    const client = clientWithConfig(config({ allowOpenRegistration: false, allowTokenRegistration: false }));

    render(<AuthenticationComponent appId="test-app-id" allowRegistration />, { wrapper: createWrapper(client) });

    await configApplied();
    expect(signUpLink()).toBeTruthy();
  });

  it('hides the sign-up link when the config denies registration and the prop is omitted', async () => {
    const client = clientWithConfig(config());

    render(<AuthenticationComponent appId="test-app-id" />, { wrapper: createWrapper(client) });

    await configApplied();
    expect(signUpLink()).toBeNull();
  });

  it('collapses an already-open register view back to login when the prop turns false', async () => {
    const client = clientWithConfig(config({ allowOpenRegistration: true }));

    const { rerender } = render(<AuthenticationComponent appId="test-app-id" />, { wrapper: createWrapper(client) });

    fireEvent.click(await screen.findByRole('button', { name: /^Sign up$/i }));
    // The register view is up: its first-name field is the marker.
    expect(await screen.findByLabelText(/First Name/i)).toBeTruthy();

    rerender(<AuthenticationComponent appId="test-app-id" allowRegistration={false} />);

    await waitFor(() => expect(screen.queryByLabelText(/First Name/i)).toBeNull());
    expect(signUpLink()).toBeNull();
    // Back on the login form rather than a blank card.
    expect(screen.getByRole('button', { name: /^Sign In$/i })).toBeTruthy();
  });
});
