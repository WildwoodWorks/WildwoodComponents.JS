import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll } from 'vitest';

// Create a fake JWT token for testing
export function createFakeJwt(claims: Record<string, unknown> = {}, expiresInSeconds = 3600): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: 'user-123',
    email: 'test@example.com',
    app_id: 'test-app-id',
    company_id: 'company-789',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    ...claims,
  };
  const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode(header)}.${encode(payload)}.fake-signature`;
}

export const fakeJwt = createFakeJwt();

// AuthenticationResponse matching the actual interface
function makeAuthResponse(email: string, firstName = 'Test', lastName = 'User') {
  return {
    id: 'auth-resp-1',
    userId: 'user-123',
    firstName,
    lastName,
    email,
    jwtToken: fakeJwt,
    refreshToken: 'fake-refresh-token',
    requiresTwoFactor: false,
    requiresPasswordReset: false,
    roles: ['User'],
    permissions: [],
    requiresDisclaimerAcceptance: false,
  };
}

export const handlers = [
  // Auth - login (note: AuthService sends PascalCase DTO)
  http.post('https://test-api.example.com/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as Record<string, string>;
    if (body.Email === 'bad@example.com') {
      return HttpResponse.json(
        { error: 'InvalidCredentials', message: 'Invalid username or password.' },
        { status: 401 },
      );
    }
    return HttpResponse.json(makeAuthResponse(body.Email || 'test@example.com'));
  }),

  // Auth - register
  http.post('https://test-api.example.com/api/auth/register', async ({ request }) => {
    const body = (await request.json()) as Record<string, string>;
    return HttpResponse.json(makeAuthResponse(body.email, body.firstName, body.lastName));
  }),

  // Auth - providers via app config
  http.get('https://test-api.example.com/api/AppComponentConfigurations/:appId/auth-providers', () => {
    return HttpResponse.json({
      authProviders: [
        {
          providerName: 'Google',
          displayName: 'Google',
          icon: 'google',
          isEnabled: true,
          clientId: 'g-id',
          redirectUri: '',
        },
        {
          providerName: 'Microsoft',
          displayName: 'Microsoft',
          icon: 'ms',
          isEnabled: true,
          clientId: 'ms-id',
          redirectUri: '',
        },
      ],
    });
  }),

  // AI - sessions
  http.get('https://test-api.example.com/api/ai/sessions', () => {
    return HttpResponse.json([
      { id: 'session-1', name: 'Test Session', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'session-2', name: 'Another Session', createdAt: '2024-01-02T00:00:00Z' },
    ]);
  }),

  // AI - chat
  http.post('https://test-api.example.com/api/ai/chat', async ({ request }) => {
    const body = (await request.json()) as Record<string, string>;
    return HttpResponse.json({
      message: `Echo: ${body.message}`,
      sessionId: body.sessionId || 'new-session',
    });
  }),

  // AI - flows
  http.get('https://test-api.example.com/api/ai/flows', () => {
    return HttpResponse.json([
      {
        id: 'flow-1',
        name: 'Test Flow',
        description: 'A test flow',
        version: 1,
        isActive: true,
        inputFields: [],
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]);
  }),

  // Disclaimers - pending
  http.get('https://test-api.example.com/api/disclaimeracceptance/pending/:appId', () => {
    return HttpResponse.json({
      disclaimers: [
        { id: 'disc-1', title: 'Terms of Service', content: 'Please accept.', version: 1, versionId: 'v1' },
      ],
    });
  }),

  // Disclaimers - accept
  http.post('https://test-api.example.com/api/disclaimeracceptance/accept', () => {
    return HttpResponse.json({ success: true });
  }),

  // App tiers - public endpoint
  http.get('https://test-api.example.com/api/app-tiers/:appId/public', () => {
    return HttpResponse.json([
      { id: 'tier-free', name: 'Free', features: ['basic'] },
      { id: 'tier-pro', name: 'Pro', features: ['basic', 'advanced'] },
    ]);
  }),

  // App tier - user subscription
  http.get('https://test-api.example.com/api/app-tiers/:appId/my-subscription', () => {
    return HttpResponse.json({ tierId: 'tier-free', tierName: 'Free' });
  }),
];

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
