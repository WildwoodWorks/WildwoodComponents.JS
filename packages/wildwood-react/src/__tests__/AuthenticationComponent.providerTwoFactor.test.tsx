import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { AuthenticationResponse } from '@wildwood/core';
import { AuthenticationComponent } from '../components/authentication/AuthenticationComponent.js';
import { createTestClient, createWrapper } from './testUtils.js';

// WildwoodAPI challenges a provider (popup) sign-in for a second factor exactly as it does a password
// sign-in: the popup hands back a response with requiresTwoFactor and no tokens. The component used to
// look only at jwtToken, so that response fell through and the sign-in silently went nowhere.

const popup = vi.hoisted(() => ({ result: null as unknown }));

vi.mock('@wildwood/core', async (importActual) => {
  const actual = await importActual<typeof import('@wildwood/core')>();
  return {
    ...actual,
    isPopupSupported: () => true,
    openOAuthPopup: vi.fn(async () => popup.result),
  };
});

function challenge(): AuthenticationResponse {
  return {
    id: 'r1',
    userId: 'user-1',
    firstName: 'Pat',
    lastName: 'Provider',
    email: 'pat@example.com',
    jwtToken: '',
    refreshToken: '',
    requiresTwoFactor: true,
    twoFactorSessionId: '2fa-session',
    availableTwoFactorMethods: [{ providerType: 'TwoFactorAuthenticator', name: 'Authenticator app' }],
    defaultTwoFactorMethod: 'TwoFactorAuthenticator',
    requiresPasswordReset: false,
    requiresDisclaimerAcceptance: false,
    roles: [],
    permissions: [],
  } as unknown as AuthenticationResponse;
}

describe('AuthenticationComponent: provider sign-in that owes a second factor', () => {
  it('shows the code step instead of signing in or doing nothing', async () => {
    popup.result = { success: true, response: challenge() };
    const client = createTestClient();
    client.auth.getAuthenticationConfiguration = vi.fn().mockResolvedValue(null);
    client.auth.getCaptchaConfiguration = vi.fn().mockResolvedValue(null);
    client.auth.getAvailableProviders = vi
      .fn()
      .mockResolvedValue([{ name: 'Google', displayName: 'Google', isEnabled: true }]);
    client.auth.getProviderAuthorizationUrl = vi.fn().mockResolvedValue('https://example.com/authorize');
    const onAuthenticationSuccess = vi.fn();

    render(<AuthenticationComponent appId="test-app-id" onAuthenticationSuccess={onAuthenticationSuccess} />, {
      wrapper: createWrapper(client),
    });
    fireEvent.click(await screen.findByRole('button', { name: /Google/ }));

    expect(await screen.findByText('Verify Your Identity')).toBeTruthy();
    expect(onAuthenticationSuccess).not.toHaveBeenCalled();
  });
});
