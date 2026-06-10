import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AuthenticationResponse } from '@wildwood/core';
import { TokenRegistrationComponent } from '../components/registration/TokenRegistrationComponent.js';
import { createTestClient, createWrapper } from './testUtils.js';

function makeAuthResponse(overrides: Partial<AuthenticationResponse> = {}): AuthenticationResponse {
  return {
    id: 'u1',
    userId: 'u1',
    firstName: 'Token',
    lastName: 'User',
    email: 'token@example.com',
    jwtToken: 'jwt-abc',
    refreshToken: 'refresh-abc',
    requiresTwoFactor: false,
    requiresPasswordReset: false,
    roles: [],
    permissions: [],
    requiresDisclaimerAcceptance: false,
    ...overrides,
  };
}

function stubCommon(client: ReturnType<typeof createTestClient>) {
  client.auth.getAuthenticationConfiguration = vi.fn().mockResolvedValue(null);
  client.auth.validateRegistration = vi.fn().mockResolvedValue({
    usernameAvailable: true,
    emailAvailable: true,
    passwordValid: true,
    passwordErrors: [],
  });
}

function fillAccountForm() {
  fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'Token' } });
  fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'User' } });
  fireEvent.change(screen.getByLabelText(/Username/i), { target: { value: 'tokenuser' } });
  fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: 'token@example.com' } });
  fireEvent.change(screen.getByLabelText(/^Password/i), { target: { value: 'P@ssw0rd123' } });
  fireEvent.change(screen.getByLabelText(/Confirm Password/i), { target: { value: 'P@ssw0rd123' } });
}

describe('TokenRegistrationComponent auto-login', () => {
  it('falls back to a credential login when registration returns no tokens', async () => {
    const client = createTestClient();
    stubCommon(client);
    // Token registration returns the normalized token-less shape (RegistrationResponseDto)
    client.auth.registerWithToken = vi.fn().mockResolvedValue(makeAuthResponse({ jwtToken: '', refreshToken: '' }));
    client.auth.login = vi.fn().mockResolvedValue(makeAuthResponse());
    client.session.login = vi.fn().mockResolvedValue(undefined);

    const onAutoLoginSuccess = vi.fn();
    render(
      <TokenRegistrationComponent
        appId="test-app-id"
        registrationToken="tok-123"
        onAutoLoginSuccess={onAutoLoginSuccess}
      />,
      { wrapper: createWrapper(client) },
    );

    fillAccountForm();
    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => expect(client.auth.login).toHaveBeenCalled());
    const loginRequest = (client.auth.login as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(loginRequest.username).toBe('tokenuser');
    expect(loginRequest.password).toBe('P@ssw0rd123');
    await waitFor(() => expect(client.session.login).toHaveBeenCalled());
    expect(onAutoLoginSuccess).toHaveBeenCalled();
    expect(await screen.findByText(/now logged in/i)).toBeTruthy();
  });

  it('uses tokens directly when registration returns them (no credential login)', async () => {
    const client = createTestClient();
    stubCommon(client);
    client.auth.registerWithToken = vi.fn().mockResolvedValue(makeAuthResponse());
    client.auth.login = vi.fn();
    client.session.login = vi.fn().mockResolvedValue(undefined);

    render(<TokenRegistrationComponent appId="test-app-id" registrationToken="tok-123" />, {
      wrapper: createWrapper(client),
    });

    fillAccountForm();
    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => expect(client.session.login).toHaveBeenCalled());
    expect(client.auth.login).not.toHaveBeenCalled();
  });

  it('shows the manual-login message when the credential fallback fails', async () => {
    const client = createTestClient();
    stubCommon(client);
    client.auth.registerWithToken = vi.fn().mockResolvedValue(makeAuthResponse({ jwtToken: '', refreshToken: '' }));
    client.auth.login = vi.fn().mockRejectedValue(new Error('Invalid credentials'));
    client.session.login = vi.fn();

    render(<TokenRegistrationComponent appId="test-app-id" registrationToken="tok-123" />, {
      wrapper: createWrapper(client),
    });

    fillAccountForm();
    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    expect(await screen.findByText(/log in manually/i)).toBeTruthy();
    expect(client.session.login).not.toHaveBeenCalled();
  });
});
