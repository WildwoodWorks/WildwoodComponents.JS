import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { UserPasskey } from '@wildwood/core';
import { WildwoodError } from '@wildwood/core';
import { PasskeyManagementComponent } from '../components/security/PasskeyManagementComponent.js';
import { arrayBufferToBase64Url, base64UrlToArrayBuffer } from '../components/security/webauthn.js';
import { createTestClient, createWrapper } from './testUtils.js';

// Port of .NET PasskeyManagementComponent: list, add (via an injected ceremony), rename, remove.

const laptop: UserPasskey = {
  id: 'pk-1',
  friendlyName: 'Laptop',
  isPlatformAuthenticator: true,
  isActive: true,
  usageCount: 1,
  createdAt: '2026-11-01T00:00:00Z',
  lastUsedAt: null,
};
const key: UserPasskey = {
  id: 'pk-2',
  friendlyName: null,
  isPlatformAuthenticator: false,
  isActive: true,
  usageCount: 0,
  createdAt: '2026-11-02T00:00:00Z',
};

function setUp(opts: { enabled?: boolean; list?: UserPasskey[] } = {}) {
  const client = createTestClient();
  client.auth.isPasskeyEnabled = vi.fn().mockResolvedValue(opts.enabled ?? true);
  client.auth.listPasskeys = vi.fn().mockResolvedValue(opts.list ?? [laptop, key]);
  client.auth.getPasskeyRegistrationOptions = vi.fn().mockResolvedValue({ challenge: 'c' });
  client.auth.completePasskeyRegistration = vi.fn().mockResolvedValue(undefined);
  client.auth.renamePasskey = vi.fn().mockResolvedValue(laptop);
  client.auth.deletePasskey = vi.fn().mockResolvedValue(undefined);
  const createCredential = vi.fn().mockResolvedValue({ id: 'new' });
  const onPasskeysChanged = vi.fn();
  render(
    <PasskeyManagementComponent
      appId="test-app-id"
      createCredential={createCredential}
      onPasskeysChanged={onPasskeysChanged}
    />,
    { wrapper: createWrapper(client) },
  );
  return { client, createCredential, onPasskeysChanged };
}

describe('PasskeyManagementComponent', () => {
  it('lists passkeys with the display-name fallback', async () => {
    setUp();
    expect(await screen.findByText('Laptop')).toBeTruthy();
    expect(screen.getByText('Security key')).toBeTruthy();
  });

  it('says so when passkeys are off for the app, and never lists', async () => {
    const { client } = setUp({ enabled: false });
    expect(await screen.findByText('Passkeys are not enabled for this app.')).toBeTruthy();
    expect(client.auth.listPasskeys).not.toHaveBeenCalled();
  });

  it('shows the empty state', async () => {
    setUp({ list: [] });
    expect(await screen.findByText('You have no passkeys yet.')).toBeTruthy();
  });

  it('adds a passkey: options with the name, ceremony, completion, reload', async () => {
    const { client, createCredential, onPasskeysChanged } = setUp();
    await screen.findByText('Laptop');
    fireEvent.change(screen.getByPlaceholderText('e.g. Work laptop'), { target: { value: 'Work key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));
    expect(await screen.findByText('Passkey "Work key" added.')).toBeTruthy();
    expect(client.auth.getPasskeyRegistrationOptions).toHaveBeenCalledWith('test-app-id', 'Work key');
    expect(createCredential).toHaveBeenCalledWith({ challenge: 'c' });
    expect(client.auth.completePasskeyRegistration).toHaveBeenCalledWith('test-app-id', { id: 'new' });
    expect(client.auth.listPasskeys).toHaveBeenCalledTimes(2);
    expect(onPasskeysChanged).toHaveBeenCalledTimes(1);
  });

  it('shows the ceremony’s own message when the user cancels', async () => {
    const { client, createCredential, onPasskeysChanged } = setUp();
    createCredential.mockRejectedValueOnce(new Error('Registration was cancelled or timed out.'));
    await screen.findByText('Laptop');
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));
    expect(await screen.findByText('Registration was cancelled or timed out.')).toBeTruthy();
    expect(client.auth.completePasskeyRegistration).not.toHaveBeenCalled();
    expect(onPasskeysChanged).not.toHaveBeenCalled();
  });

  it('renames a passkey', async () => {
    const { client } = setUp();
    await screen.findByText('Laptop');
    fireEvent.click(screen.getByRole('button', { name: 'Rename Laptop' }));
    fireEvent.change(screen.getByLabelText('Passkey name'), { target: { value: 'Desk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Passkey renamed.')).toBeTruthy();
    expect(client.auth.renamePasskey).toHaveBeenCalledWith('pk-1', 'Desk');
  });

  it('removes only after confirmation, and reports the API’s message on refusal', async () => {
    const { client } = setUp();
    await screen.findByText('Laptop');
    (client.auth.deletePasskey as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      WildwoodError.fromResponse(400, { message: 'You must keep one sign-in method.' }, 'Bad Request'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove Laptop' }));
    expect(client.auth.deletePasskey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('You must keep one sign-in method.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.getByText('Passkey "Laptop" removed.')).toBeTruthy());
    expect(client.auth.deletePasskey).toHaveBeenCalledTimes(2);
  });
});

describe('webauthn base64url helpers', () => {
  it('round-trips', () => {
    const value = 'AQIDBAUG_-8';
    expect(arrayBufferToBase64Url(base64UrlToArrayBuffer(value))).toBe(value);
  });
});
