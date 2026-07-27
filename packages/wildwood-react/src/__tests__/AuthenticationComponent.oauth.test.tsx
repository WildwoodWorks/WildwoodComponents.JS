import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AuthProvider } from '@wildwood/core';
import { AuthenticationComponent } from '../components/authentication/AuthenticationComponent.js';
import { createTestClient, createWrapper } from './testUtils.js';

const googleProvider: AuthProvider = {
  name: 'Google',
  displayName: 'Google',
  icon: 'google',
  isEnabled: true,
};

describe('AuthenticationComponent OAuth', () => {
  it('requests the authorization URL for the clicked provider', async () => {
    const client = createTestClient();
    client.auth.getAuthenticationConfiguration = vi.fn().mockResolvedValue(null);
    client.auth.getCaptchaConfiguration = vi.fn().mockResolvedValue(null);
    client.auth.getAvailableProviders = vi.fn().mockResolvedValue([googleProvider]);
    // Returning null exercises the wiring without opening a popup/navigating
    client.auth.getProviderAuthorizationUrl = vi.fn().mockResolvedValue(null);

    render(<AuthenticationComponent appId="test-app-id" />, { wrapper: createWrapper(client) });

    const providerButton = await screen.findByRole('button', { name: /Google/i });
    fireEvent.click(providerButton);

    await waitFor(() => expect(client.auth.getProviderAuthorizationUrl).toHaveBeenCalledWith('Google', 'test-app-id'));
    // Null URL surfaces a user-facing error instead of silently doing nothing
    expect(await screen.findByText(/Unable to get authorization URL/i)).toBeTruthy();
  });

  it('renders no provider section when the app has no providers', async () => {
    const client = createTestClient();
    client.auth.getAuthenticationConfiguration = vi.fn().mockResolvedValue(null);
    client.auth.getCaptchaConfiguration = vi.fn().mockResolvedValue(null);
    client.auth.getAvailableProviders = vi.fn().mockResolvedValue([]);

    render(<AuthenticationComponent appId="test-app-id" />, { wrapper: createWrapper(client) });

    await waitFor(() => expect(client.auth.getAvailableProviders).toHaveBeenCalled());
    expect(screen.queryByText(/or$/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Google/i })).toBeNull();
  });

  it('renders buttonText verbatim as the provider label when configured', async () => {
    const client = createTestClient();
    client.auth.getAuthenticationConfiguration = vi.fn().mockResolvedValue(null);
    client.auth.getCaptchaConfiguration = vi.fn().mockResolvedValue(null);
    client.auth.getAvailableProviders = vi
      .fn()
      .mockResolvedValue([{ ...googleProvider, buttonText: 'Continue with Google' }]);

    render(<AuthenticationComponent appId="test-app-id" />, { wrapper: createWrapper(client) });

    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
  });

  it('falls back to "Sign in with {displayName}" without doubling an existing prefix', async () => {
    const client = createTestClient();
    client.auth.getAuthenticationConfiguration = vi.fn().mockResolvedValue(null);
    client.auth.getCaptchaConfiguration = vi.fn().mockResolvedValue(null);
    client.auth.getAvailableProviders = vi.fn().mockResolvedValue([
      googleProvider,
      // Some existing configs store the full label in displayName already.
      { name: 'Okta', displayName: 'Sign in using Okta', icon: '', isEnabled: true },
    ]);

    render(<AuthenticationComponent appId="test-app-id" />, { wrapper: createWrapper(client) });

    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Sign in using Okta' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Sign in with Sign in/i })).toBeNull();
  });
});
