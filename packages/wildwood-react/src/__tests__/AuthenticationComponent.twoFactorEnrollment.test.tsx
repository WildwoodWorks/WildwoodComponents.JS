import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AuthenticationResponse } from '@wildwood/core';
import { AuthenticationComponent } from '../components/authentication/AuthenticationComponent.js';
import { createTestClient, createWrapper } from './testUtils.js';

// The API's "2FA required" policy: signing in without a second factor on an app that requires one
// returns a restricted session. The component must hold the user on two-factor setup, not report
// success, and finish sign-in once the refreshed session is unrestricted.

function pendingResponse(): AuthenticationResponse {
  return {
    id: 'r1',
    userId: 'user-1',
    firstName: 'Pat',
    lastName: 'Pending',
    email: 'pat@example.com',
    jwtToken: 'header.e30.sig',
    refreshToken: 'refresh-1',
    requiresTwoFactor: false,
    requiresTwoFactorEnrollment: true,
    requiresPasswordReset: false,
    requiresDisclaimerAcceptance: false,
    roles: [],
    permissions: [],
  };
}

function setUp() {
  const client = createTestClient();
  client.auth.getAuthenticationConfiguration = vi.fn().mockResolvedValue(null);
  client.auth.getCaptchaConfiguration = vi.fn().mockResolvedValue(null);
  client.auth.getAvailableProviders = vi.fn().mockResolvedValue([]);
  client.auth.login = vi.fn().mockResolvedValue(pendingResponse());
  // The embedded two-factor settings panel loads on mount.
  client.twoFactor.getStatus = vi.fn().mockResolvedValue({ isEnabled: false });
  client.twoFactor.getCredentials = vi.fn().mockResolvedValue([]);
  const onAuthenticationSuccess = vi.fn();
  render(<AuthenticationComponent appId="test-app-id" onAuthenticationSuccess={onAuthenticationSuccess} />, {
    wrapper: createWrapper(client),
  });
  return { client, onAuthenticationSuccess };
}

async function signIn() {
  fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'pat@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
}

describe('AuthenticationComponent: required two-factor enrollment', () => {
  it('holds a restricted sign-in on two-factor setup instead of reporting success', async () => {
    const { client, onAuthenticationSuccess } = setUp();

    await signIn();

    expect(await screen.findByText(/requires two-factor authentication/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Authenticator' })).toBeTruthy();
    expect(client.session.isTwoFactorEnrollmentPending).toBe(true);
    expect(onAuthenticationSuccess).not.toHaveBeenCalled();
  });

  it('stays on setup with a message when Continue is pressed before enrolling', async () => {
    const { client, onAuthenticationSuccess } = setUp();
    client.session.completeTwoFactorEnrollment = vi.fn().mockResolvedValue(false);

    await signIn();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(/not set up yet/i)).toBeTruthy();
    expect(onAuthenticationSuccess).not.toHaveBeenCalled();
  });

  it('completes sign-in once the refreshed session is unrestricted', async () => {
    const { client, onAuthenticationSuccess } = setUp();
    client.session.completeTwoFactorEnrollment = vi.fn().mockResolvedValue(true);

    await signIn();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onAuthenticationSuccess).toHaveBeenCalledOnce());
    expect(client.session.completeTwoFactorEnrollment).toHaveBeenCalled();
  });
});
