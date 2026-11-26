import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server, createFakeJwt } from './setup.js';
import { createWildwoodClient } from '../../index.js';

// The API accepts a passkey assertion only against the challenge it issued, identified by the options'
// sessionId; without it every passkey sign-in is refused as "Passkey sign-in expired".

const BASE = 'https://test-api.example.com';

const credential = {
  id: 'cred',
  rawId: 'cred',
  type: 'public-key',
  response: { clientDataJSON: 'c', authenticatorData: 'a', signature: 's', userHandle: 'u' },
};

function setup() {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http.post(`${BASE}/api/webauthn/authenticate/options`, () =>
      HttpResponse.json({ challenge: 'abc', rpId: 'example.com', sessionId: 'session-42' }),
    ),
    http.post(`${BASE}/api/webauthn/authenticate`, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({
        id: 'r',
        userId: 'user-123',
        email: 'p@example.com',
        jwtToken: createFakeJwt(),
        refreshToken: 'rt',
        requiresTwoFactor: false,
        requiresPasswordReset: false,
        roles: [],
        permissions: [],
      });
    }),
  );
  const client = createWildwoodClient({ baseUrl: BASE, appId: 'test-app-id', storage: 'memory' });
  return { client, bodies };
}

describe('passkey sign-in', () => {
  it('sends the session id from the options call', async () => {
    const { client, bodies } = setup();
    await client.auth.getPasskeyAuthenticationOptions('test-app-id');
    await client.auth.verifyPasskeyAuthentication('test-app-id', credential);
    expect(bodies[0]?.SessionId).toBe('session-42');
  });

  it('prefers an explicitly passed session id', async () => {
    const { client, bodies } = setup();
    await client.auth.getPasskeyAuthenticationOptions('test-app-id');
    await client.auth.verifyPasskeyAuthentication('test-app-id', credential, 'explicit-1');
    expect(bodies[0]?.SessionId).toBe('explicit-1');
  });
});
