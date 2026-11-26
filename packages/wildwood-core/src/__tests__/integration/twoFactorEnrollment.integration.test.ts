import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server, createFakeJwt } from './setup.js';
import { createWildwoodClient, WildwoodError, isTwoFactorEnrollmentPending } from '../../index.js';

// The API's "2FA required" contract: a user without a second factor on an app that requires one gets
// a restricted token (claim tfa_enroll_pending, response flag requiresTwoFactorEnrollment). Every call
// but enrollment/auth/disclaimers is refused with 403 TWO_FACTOR_ENROLLMENT_REQUIRED, and a refresh
// after enrolling returns an unrestricted token.

const BASE = 'https://test-api.example.com';
const restrictedJwt = () => createFakeJwt({ tfa_enroll_pending: 'true' });

function authResponse(jwtToken: string, requiresTwoFactorEnrollment: boolean) {
  return {
    id: 'auth-resp-1',
    userId: 'user-123',
    firstName: 'Pending',
    lastName: 'User',
    email: 'pending@example.com',
    jwtToken,
    refreshToken: 'pending-refresh-token',
    requiresTwoFactor: false,
    requiresTwoFactorEnrollment,
    requiresPasswordReset: false,
    roles: ['User'],
    permissions: [],
    requiresDisclaimerAcceptance: false,
  };
}

let enrolled = false;
let refreshCalls = 0;

beforeEach(() => {
  enrolled = false;
  refreshCalls = 0;
  server.use(
    http.post(`${BASE}/api/auth/login`, () => HttpResponse.json(authResponse(restrictedJwt(), true))),
    http.post(`${BASE}/api/auth/refresh-token`, () => {
      refreshCalls++;
      return enrolled
        ? HttpResponse.json(authResponse(createFakeJwt(), false))
        : HttpResponse.json(authResponse(restrictedJwt(), true));
    }),
    http.get(`${BASE}/api/app-tiers/:appId/my-subscription`, ({ request }) => {
      const token = request.headers.get('authorization')?.slice('Bearer '.length) ?? '';
      if (isTwoFactorEnrollmentPending(token)) {
        return HttpResponse.json(
          {
            error: 'Two-factor authentication must be set up before continuing.',
            errorCode: 'TWO_FACTOR_ENROLLMENT_REQUIRED',
          },
          { status: 403 },
        );
      }
      return HttpResponse.json({ tierName: 'Pro' });
    }),
  );
});

function createTestClient() {
  return createWildwoodClient({
    baseUrl: BASE,
    appId: 'test-app-id',
    storage: 'memory',
    enableAutoTokenRefresh: true,
  });
}

async function signIn(client: ReturnType<typeof createTestClient>) {
  const response = await client.auth.login({
    email: 'pending@example.com',
    password: 'password',
    appId: 'test-app-id',
    appVersion: '1.0.0',
    platform: 'web',
    deviceInfo: 'test',
  });
  await client.session.login(response);
  return response;
}

describe('Two-factor enrollment required (msw)', () => {
  it('an auth response with the flag puts the session in the pending state and raises the event once', async () => {
    const client = createTestClient();
    const events: string[] = [];
    client.events.on('twoFactorEnrollmentRequired', ({ source }) => events.push(source));

    const response = await signIn(client);

    expect(response.requiresTwoFactorEnrollment).toBe(true);
    expect(client.session.isTwoFactorEnrollmentPending).toBe(true);
    // login() and session.login() both see the response; the event fires on the transition only.
    expect(events).toEqual(['authResponse']);
  });

  it('a restricted token alone (no flag) is also treated as pending', async () => {
    const client = createTestClient();
    await client.session.login({ ...authResponse(restrictedJwt(), false) });

    expect(client.session.isTwoFactorEnrollmentPending).toBe(true);
  });

  it('a 403 TWO_FACTOR_ENROLLMENT_REQUIRED surfaces as a typed error and raises the event', async () => {
    const client = createTestClient();
    // A token the client does not recognise as restricted, refused by the API anyway (for example,
    // the app started requiring 2FA after this session was created).
    await client.session.login({ ...authResponse(createFakeJwt(), false) });
    expect(client.session.isTwoFactorEnrollmentPending).toBe(false);

    server.use(
      http.get(`${BASE}/api/app-tiers/:appId/my-subscription`, () =>
        HttpResponse.json(
          { error: 'Two-factor authentication must be set up.', errorCode: 'TWO_FACTOR_ENROLLMENT_REQUIRED' },
          { status: 403 },
        ),
      ),
    );
    const sources: string[] = [];
    client.events.on('twoFactorEnrollmentRequired', ({ source }) => sources.push(source));

    const error = await client.http.get('api/app-tiers/test-app-id/my-subscription').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WildwoodError);
    expect((error as WildwoodError).code).toBe('TwoFactorEnrollmentRequired');
    expect((error as WildwoodError).status).toBe(403);
    expect(sources).toEqual(['apiRefusal']);
    expect(client.session.isTwoFactorEnrollmentPending).toBe(true);
  });

  it('the 403 is not treated as an expired session: no refresh is attempted', async () => {
    const client = createTestClient();
    await signIn(client);

    await expect(client.http.get('api/app-tiers/test-app-id/my-subscription')).rejects.toMatchObject({
      code: 'TwoFactorEnrollmentRequired',
    });
    expect(refreshCalls).toBe(0);
  });

  it('completeTwoFactorEnrollment refreshes right away and lifts the restriction', async () => {
    const client = createTestClient();
    await signIn(client);
    const completed: number[] = [];
    client.events.on('twoFactorEnrollmentCompleted', () => completed.push(1));

    enrolled = true; // the user finished enrolling on the server
    // Signed in milliseconds ago: an ordinary refresh would be skipped as "recent".
    await expect(client.session.completeTwoFactorEnrollment()).resolves.toBe(true);

    expect(refreshCalls).toBe(1);
    expect(client.session.isTwoFactorEnrollmentPending).toBe(false);
    expect(completed).toHaveLength(1);
    await expect(client.http.get('api/app-tiers/test-app-id/my-subscription')).resolves.toMatchObject({
      data: { tierName: 'Pro' },
    });
  });

  it('completeTwoFactorEnrollment reports false while the API still restricts the user', async () => {
    const client = createTestClient();
    await signIn(client);

    await expect(client.session.completeTwoFactorEnrollment()).resolves.toBe(false);
    expect(client.session.isTwoFactorEnrollmentPending).toBe(true);
  });

  it('signing out clears the pending state', async () => {
    const client = createTestClient();
    await signIn(client);

    server.use(http.post(`${BASE}/api/auth/revoke-token`, () => HttpResponse.json({})));
    await client.auth.logout();

    expect(client.session.isTwoFactorEnrollmentPending).toBe(false);
  });
});
