import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './setup.js';
import { createWildwoodClient, AuthErrorCodes } from '../../index.js';

// Passkey management over api/webauthn — the same four routes and body shapes as .NET
// PasskeyManagementService (WildwoodComponents.Blazor/Services/PasskeyManagementService.cs).
const BASE = 'https://test-api.example.com';

const passkey = {
  id: 'pk-1',
  friendlyName: 'Laptop',
  deviceInfo: null,
  isPlatformAuthenticator: true,
  isActive: true,
  lastUsedAt: null,
  usageCount: 3,
  createdAt: '2026-11-01T00:00:00Z',
};

function client() {
  return createWildwoodClient({ baseUrl: BASE, appId: 'test-app-id', storage: 'memory' });
}

describe('passkey management', () => {
  it('lists the signed-in user’s passkeys for the app', async () => {
    let url = '';
    server.use(
      http.get(`${BASE}/api/webauthn/credentials`, ({ request }) => {
        url = request.url;
        return HttpResponse.json([passkey]);
      }),
    );
    const list = await client().auth.listPasskeys('app 1');
    expect(list).toEqual([passkey]);
    expect(new URL(url).searchParams.get('appId')).toBe('app 1');
  });

  it('renames with a PATCH carrying the trimmed FriendlyName', async () => {
    let body: unknown;
    let method = '';
    server.use(
      http.patch(`${BASE}/api/webauthn/credentials/pk-1`, async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json({ ...passkey, friendlyName: 'Phone' });
      }),
    );
    const renamed = await client().auth.renamePasskey('pk-1', '  Phone ');
    expect(method).toBe('PATCH');
    expect(body).toEqual({ FriendlyName: 'Phone' });
    expect(renamed?.friendlyName).toBe('Phone');
  });

  it('deletes by id', async () => {
    let deleted = false;
    server.use(
      http.delete(`${BASE}/api/webauthn/credentials/pk-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await client().auth.deletePasskey('pk-1');
    expect(deleted).toBe(true);
  });

  it('reports a refused delete as an error', async () => {
    server.use(
      http.delete(`${BASE}/api/webauthn/credentials/pk-1`, () =>
        HttpResponse.json({ message: 'Not yours' }, { status: 404 }),
      ),
    );
    await expect(client().auth.deletePasskey('pk-1')).rejects.toBeTruthy();
  });

  it.each([
    [true, true],
    [{ enabled: true }, true],
    [{ Enabled: true }, true],
    [{ enabled: false }, false],
    [false, false],
  ])('reads the enabled answer %j as %s', async (answer, expected) => {
    server.use(http.get(`${BASE}/api/webauthn/enabled/test-app-id`, () => HttpResponse.json(answer)));
    expect(await client().auth.isPasskeyEnabled('test-app-id')).toBe(expected);
  });

  it('answers not-enabled when the check fails', async () => {
    server.use(http.get(`${BASE}/api/webauthn/enabled/test-app-id`, () => new HttpResponse(null, { status: 500 })));
    expect(await client().auth.isPasskeyEnabled('test-app-id')).toBe(false);
  });

  it('sends FriendlyName on register/options, null when blank', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${BASE}/api/webauthn/register/options`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ challenge: 'c' });
      }),
    );
    const c = client();
    await c.auth.getPasskeyRegistrationOptions('test-app-id', ' Work key ');
    await c.auth.getPasskeyRegistrationOptions('test-app-id', '   ');
    await c.auth.getPasskeyRegistrationOptions('test-app-id');
    expect(bodies).toEqual([
      { AppId: 'test-app-id', FriendlyName: 'Work key' },
      { AppId: 'test-app-id', FriendlyName: null },
      { AppId: 'test-app-id', FriendlyName: null },
    ]);
  });
});

describe('AuthErrorCodes', () => {
  it('carries the two-factor enrollment wire code', () => {
    expect(AuthErrorCodes.TwoFactorEnrollmentRequired).toBe('TWO_FACTOR_ENROLLMENT_REQUIRED');
  });
});
