import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AuthenticationResponse } from '@wildwood/core';
import { AuthenticationComponent } from '../components/authentication/AuthenticationComponent.js';
import { TwoFactorSettingsComponent } from '../components/twofactor/TwoFactorSettingsComponent.js';
import { createTestClient, createWrapper } from './testUtils.js';

// Parity with .NET: AuthenticationComponent.OnTwoFactorEnrollmentRequired, and the
// TwoFactorSettingsComponent "app-not-enforcing" notice.

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

describe('AuthenticationComponent onTwoFactorEnrollmentRequired', () => {
  it('hands a restricted sign-in to the host instead of showing the built-in enrollment view', async () => {
    const client = createTestClient();
    client.auth.getAuthenticationConfiguration = vi.fn().mockResolvedValue(null);
    client.auth.getCaptchaConfiguration = vi.fn().mockResolvedValue(null);
    client.auth.getAvailableProviders = vi.fn().mockResolvedValue([]);
    client.auth.login = vi.fn().mockResolvedValue(pendingResponse());
    const onTwoFactorEnrollmentRequired = vi.fn();
    const onAuthenticationSuccess = vi.fn();
    render(
      <AuthenticationComponent
        appId="test-app-id"
        onAuthenticationSuccess={onAuthenticationSuccess}
        onTwoFactorEnrollmentRequired={onTwoFactorEnrollmentRequired}
      />,
      { wrapper: createWrapper(client) },
    );

    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'pat@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => expect(onTwoFactorEnrollmentRequired).toHaveBeenCalledTimes(1));
    expect(onTwoFactorEnrollmentRequired.mock.calls[0][0].userId).toBe('user-1');
    expect(onAuthenticationSuccess).not.toHaveBeenCalled();
    expect(screen.queryByText(/requires two-factor authentication/i)).toBeNull();
  });
});

describe('TwoFactorSettingsComponent app-not-enforcing notice', () => {
  // `appId: null` means "the host names no app"; a default parameter would swallow `undefined`.
  function setUp(config: { isEnabled: boolean } | null, enabledForUser = false, appId: string | null = 'app-1') {
    const client = createTestClient();
    client.twoFactor.getStatus = vi.fn().mockResolvedValue({ isEnabled: enabledForUser });
    client.twoFactor.getCredentials = vi.fn().mockResolvedValue([]);
    client.twoFactor.getConfiguration = vi.fn().mockResolvedValue(config);
    const { container } = render(<TwoFactorSettingsComponent appId={appId ?? undefined} />, {
      wrapper: createWrapper(client),
    });
    return { client, container };
  }

  it('says so and offers no enrollment when the app does not enforce two-factor', async () => {
    const { container } = setUp({ isEnabled: false });
    await waitFor(() => expect(container.querySelector('[data-ww-2fa-notice="app-not-enforcing"]')).not.toBeNull());
    expect(screen.queryByRole('button', { name: 'Add Email' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Authenticator' })).toBeNull();
  });

  it('tells an enrolled user their methods can still be removed', async () => {
    setUp({ isEnabled: false }, true);
    expect(await screen.findByText(/can be removed/)).toBeTruthy();
  });

  it('offers enrollment as before when the app enforces it, or when the config cannot be read', async () => {
    const { client } = setUp({ isEnabled: true });
    expect(await screen.findByRole('button', { name: 'Add Email' })).toBeTruthy();
    expect(client.twoFactor.getConfiguration).toHaveBeenCalledWith('app-1');
  });

  it('does not check at all when the host names no app', async () => {
    const { client, container } = setUp({ isEnabled: false }, false, null);
    expect(await screen.findByRole('button', { name: 'Add Email' })).toBeTruthy();
    expect(client.twoFactor.getConfiguration).not.toHaveBeenCalled();
    expect(container.querySelector('[data-ww-2fa-notice]')).toBeNull();
  });
});
