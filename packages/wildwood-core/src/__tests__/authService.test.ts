import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../auth/authService.js';
import { HttpClient } from '../client/httpClient.js';
import { WildwoodEventEmitter } from '../events/eventEmitter.js';
import { MemoryStorageAdapter } from '../platform/storageService.js';
import type { AuthenticationResponse } from '../auth/types.js';
import type { AttributionPayload } from '../attribution/types.js';

function createConfig() {
  return { baseUrl: 'https://api.example.com', enableRetry: false };
}

function mockAuthResponse(overrides?: Partial<AuthenticationResponse>): AuthenticationResponse {
  return {
    id: 'auth-1',
    userId: 'user-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    jwtToken: 'jwt-token-123',
    refreshToken: 'refresh-token-456',
    requiresTwoFactor: false,
    requiresPasswordReset: false,
    roles: ['User'],
    permissions: [],
    requiresDisclaimerAcceptance: false,
    ...overrides,
  };
}

describe('AuthService', () => {
  let http: HttpClient;
  let storage: MemoryStorageAdapter;
  let events: WildwoodEventEmitter;
  let auth: AuthService;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    http = new HttpClient(createConfig());
    storage = new MemoryStorageAdapter();
    events = new WildwoodEventEmitter();
    auth = new AuthService(http, storage, events);
  });

  function mockPost(body: unknown, status = 200) {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );
  }

  function mockGet(body: unknown, status = 200) {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: new Headers({ 'content-type': 'application/json' }),
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------

  describe('login', () => {
    it('stores tokens on successful login', async () => {
      const authResp = mockAuthResponse();
      mockPost(authResp);

      const result = await auth.login({ username: 'john', password: 'pass', appId: 'app-1' });

      expect(result.jwtToken).toBe('jwt-token-123');
      expect(await storage.getItem('ww_accessToken')).toBe('jwt-token-123');
      expect(await storage.getItem('ww_refreshToken')).toBe('refresh-token-456');
    });

    it('emits authChanged event on login', async () => {
      const authResp = mockAuthResponse();
      mockPost(authResp);
      const handler = vi.fn();
      events.on('authChanged', handler);

      await auth.login({ username: 'john', password: 'pass' });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
    });

    it('does not store tokens when 2FA is required', async () => {
      const authResp = mockAuthResponse({
        requiresTwoFactor: true,
        jwtToken: '',
        refreshToken: '',
        twoFactorSessionId: 'session-abc',
      });
      mockPost(authResp);

      const result = await auth.login({ username: 'john', password: 'pass' });

      expect(result.requiresTwoFactor).toBe(true);
      expect(await storage.getItem('ww_accessToken')).toBeNull();
    });

    it('calls onAuthChanged handler', async () => {
      const handler = vi.fn();
      auth.setAuthChangedHandler(handler);
      mockPost(mockAuthResponse());

      await auth.login({ username: 'john', password: 'pass' });

      expect(handler).toHaveBeenCalledOnce();
    });

    it('sends correct DTO shape to API', async () => {
      mockPost(mockAuthResponse());

      await auth.login({
        username: 'john',
        email: 'john@test.com',
        password: 'pass',
        appId: 'app-1',
        platform: 'web',
        deviceInfo: 'Chrome',
      });

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.Username).toBe('john');
      expect(body.Email).toBe('john@test.com');
      expect(body.Password).toBe('pass');
      expect(body.AppId).toBe('app-1');
      expect(body.Platform).toBe('web');
    });
  });

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  describe('register', () => {
    it('stores tokens on successful registration', async () => {
      mockPost(mockAuthResponse());

      const result = await auth.register({
        email: 'new@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        password: 'pass123',
        appId: 'app-1',
      });

      expect(result.userId).toBe('user-1');
      expect(await storage.getItem('ww_accessToken')).toBe('jwt-token-123');
    });

    it('does not store tokens when jwtToken is empty', async () => {
      mockPost(mockAuthResponse({ jwtToken: '' }));

      await auth.register({
        email: 'new@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        password: 'pass123',
        appId: 'app-1',
      });

      expect(await storage.getItem('ww_accessToken')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------------------

  describe('logout', () => {
    it('clears stored tokens', async () => {
      // Login first
      mockPost(mockAuthResponse());
      await auth.login({ username: 'john', password: 'pass' });
      expect(await storage.getItem('ww_accessToken')).toBe('jwt-token-123');

      // Logout (server call)
      mockPost({});
      await auth.logout();

      expect(await storage.getItem('ww_accessToken')).toBeNull();
      expect(await storage.getItem('ww_refreshToken')).toBeNull();
      expect(await storage.getItem('ww_user')).toBeNull();
    });

    it('emits authChanged null on logout', async () => {
      const handler = vi.fn();
      events.on('authChanged', handler);

      mockPost({});
      await auth.logout();

      expect(handler).toHaveBeenCalledWith(null);
    });

    it('clears tokens even if server logout fails', async () => {
      mockPost(mockAuthResponse());
      await auth.login({ username: 'john', password: 'pass' });

      // Server returns error
      fetchSpy.mockRejectedValueOnce(new Error('Network error'));
      await auth.logout();

      expect(await storage.getItem('ww_accessToken')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Token Refresh
  // -------------------------------------------------------------------------

  describe('refreshToken', () => {
    it('refreshes token and stores new credentials', async () => {
      // Store initial refresh token
      await storage.setItem('ww_refreshToken', 'old-refresh-token');

      const newAuth = mockAuthResponse({ jwtToken: 'new-jwt', refreshToken: 'new-refresh' });
      mockPost(newAuth);

      const result = await auth.refreshToken();

      expect(result).toBe(true);
      expect(await storage.getItem('ww_accessToken')).toBe('new-jwt');
      expect(await storage.getItem('ww_refreshToken')).toBe('new-refresh');
    });

    it('returns false when no refresh token stored', async () => {
      const result = await auth.refreshToken();
      expect(result).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('clears tokens on 401 response', async () => {
      await storage.setItem('ww_refreshToken', 'expired-token');
      await storage.setItem('ww_accessToken', 'old-jwt');

      // Return a 401 response (not a rejection) so HttpClient throws WildwoodError(401)
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Invalid refresh token' }), {
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
        }),
      );

      const result = await auth.refreshToken();

      expect(result).toBe(false);
      expect(await storage.getItem('ww_accessToken')).toBeNull();
    });

    it('emits tokenRefreshed event', async () => {
      await storage.setItem('ww_refreshToken', 'token');
      const handler = vi.fn();
      events.on('tokenRefreshed', handler);

      mockPost(mockAuthResponse({ jwtToken: 'refreshed-jwt' }));
      await auth.refreshToken();

      expect(handler).toHaveBeenCalledWith('refreshed-jwt');
    });

    // The refresh-token endpoint never sets requiresPasswordReset, so it always comes back
    // false. Storing that verbatim would silently clear a pending forced reset.
    it('preserves a pending requiresPasswordReset across a refresh', async () => {
      await storage.setItem('ww_refreshToken', 'token');
      await storage.setItem('ww_user', JSON.stringify(mockAuthResponse({ requiresPasswordReset: true })));

      mockPost(mockAuthResponse({ jwtToken: 'refreshed-jwt', requiresPasswordReset: false }));
      await auth.refreshToken();

      const stored = await auth.getStoredUser();
      expect(stored?.requiresPasswordReset).toBe(true);
    });

    it('does not invent requiresPasswordReset when none was pending', async () => {
      await storage.setItem('ww_refreshToken', 'token');
      await storage.setItem('ww_user', JSON.stringify(mockAuthResponse({ requiresPasswordReset: false })));

      mockPost(mockAuthResponse({ jwtToken: 'refreshed-jwt', requiresPasswordReset: false }));
      await auth.refreshToken();

      const stored = await auth.getStoredUser();
      expect(stored?.requiresPasswordReset).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Password Reset
  // -------------------------------------------------------------------------

  describe('resetPassword', () => {
    function authHeaderOf(callIndex = 0): string | undefined {
      const init = fetchSpy.mock.calls[callIndex]?.[1] as RequestInit | undefined;
      return (init?.headers as Record<string, string> | undefined)?.['Authorization'];
    }

    // The regression: the server identifies the user solely from the JWT, so a reset sent
    // without one 401s and strands every temp-password account on the reset screen.
    it('sends the session bearer token when no reset token is supplied', async () => {
      http.setTokenProvider(async () => 'jwt-token-123');
      mockPost({ message: 'Password reset successful' });

      await auth.resetPassword('NewPass1!', 'NewPass1!', 'app-1');

      expect(authHeaderOf()).toBe('Bearer jwt-token-123');
    });

    it('omits the body reset token when none is supplied', async () => {
      http.setTokenProvider(async () => 'jwt-token-123');
      mockPost({ message: 'Password reset successful' });

      await auth.resetPassword('NewPass1!', 'NewPass1!', 'app-1');

      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).toEqual({ NewPassword: 'NewPass1!', ConfirmPassword: 'NewPass1!', AppId: 'app-1' });
    });

    // An emailed-link reset is the one case that is legitimately anonymous.
    it('stays anonymous and sends the reset token when one is supplied', async () => {
      http.setTokenProvider(async () => 'jwt-token-123');
      mockPost({ message: 'Password reset successful' });

      await auth.resetPassword('NewPass1!', 'NewPass1!', 'app-1', 'link-token');

      expect(authHeaderOf()).toBeUndefined();
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.ResetToken).toBe('link-token');
    });
  });

  describe('requestPasswordReset', () => {
    it('posts anonymously to forgot-password', async () => {
      http.setTokenProvider(async () => 'jwt-token-123');
      mockPost({ message: 'If an account with that email exists, a password reset email has been sent.' });

      await auth.requestPasswordReset('john@example.com', 'app-1');

      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
      expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
      expect(JSON.parse(init.body as string)).toEqual({ Email: 'john@example.com', AppId: 'app-1' });
    });
  });

  // -------------------------------------------------------------------------
  // Password Validation
  // -------------------------------------------------------------------------

  describe('validatePassword', () => {
    it('returns invalid for empty password', async () => {
      const result = await auth.validatePassword('', 'app-1');
      expect(result.isValid).toBe(false);
    });

    it('validates against app configuration rules', async () => {
      mockGet({
        passwordMinimumLength: 8,
        passwordRequireUppercase: true,
        passwordRequireLowercase: true,
        passwordRequireDigit: true,
        passwordRequireSpecialChar: false,
      });

      const result = await auth.validatePassword('Pass1234', 'app-1');
      expect(result.isValid).toBe(true);
    });

    it('rejects password too short', async () => {
      mockGet({
        passwordMinimumLength: 8,
        passwordRequireUppercase: false,
        passwordRequireLowercase: false,
        passwordRequireDigit: false,
        passwordRequireSpecialChar: false,
      });

      const result = await auth.validatePassword('short', 'app-1');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('8 characters');
    });
  });

  // -------------------------------------------------------------------------
  // Stored User
  // -------------------------------------------------------------------------

  describe('getStoredUser', () => {
    it('returns null when nothing stored', async () => {
      const user = await auth.getStoredUser();
      expect(user).toBeNull();
    });

    it('returns parsed user after login', async () => {
      mockPost(mockAuthResponse({ email: 'stored@test.com' }));
      await auth.login({ username: 'john', password: 'pass' });

      const user = await auth.getStoredUser();
      expect(user).not.toBeNull();
      expect(user!.email).toBe('stored@test.com');
    });

    it('returns null for corrupt stored data', async () => {
      await storage.setItem('ww_user', 'not-json{{{');
      const user = await auth.getStoredUser();
      expect(user).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Provider Configuration
  // -------------------------------------------------------------------------

  describe('getAvailableProviders', () => {
    it('returns empty array on error', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network error'));

      const providers = await auth.getAvailableProviders('app-1');
      expect(providers).toEqual([]);
    });

    it('filters and sorts enabled providers', async () => {
      mockGet({
        authProviders: [
          {
            providerName: 'google',
            displayName: 'Google',
            icon: 'g',
            isEnabled: true,
            clientId: 'c1',
            redirectUri: '',
          },
          {
            providerName: 'disabled',
            displayName: 'Disabled',
            icon: 'd',
            isEnabled: false,
            clientId: '',
            redirectUri: '',
          },
          { providerName: 'apple', displayName: 'Apple', icon: 'a', isEnabled: true, clientId: 'c2', redirectUri: '' },
        ],
      });

      const providers = await auth.getAvailableProviders('app-1');
      expect(providers).toHaveLength(2);
      expect(providers[0].name).toBe('apple'); // sorted alphabetically
      expect(providers[1].name).toBe('google');
    });

    it('carries buttonText from the provider details onto the mapped provider', async () => {
      mockGet({
        authProviders: [
          {
            providerName: 'google',
            displayName: 'Google',
            icon: 'g',
            isEnabled: true,
            buttonText: 'Continue with Google',
            clientId: 'c1',
            redirectUri: '',
          },
        ],
      });

      const providers = await auth.getAvailableProviders('app-1');
      expect(providers[0].buttonText).toBe('Continue with Google');
    });
  });
});

describe('AuthService campaign attribution', () => {
  const payload: AttributionPayload = {
    version: 1,
    visitorKey: 'visitor-key-0001',
    firstTouch: null,
    lastTouch: {
      source: 'reddit',
      medium: 'paid',
      campaign: 'govcon-test-sep26',
      term: null,
      content: 'ad1',
      clickIdName: null,
      clickIdValue: null,
      referrerHost: null,
      landingHost: 'cairnfed.ai',
      landingPath: '/',
      extraParams: null,
      occurredAt: '2026-09-13T12:00:00.000Z',
    },
    platform: 'web',
    sdk: 'js',
  };
  const registration = {
    email: 'new@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    password: 'pass123',
    appId: 'app-1',
  };

  let fetchSpy: ReturnType<typeof vi.fn>;
  let auth: AuthService;
  let events: WildwoodEventEmitter;
  let source: { getForRegistration: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn> };

  function respond(body: unknown, status = 200) {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status, headers: new Headers({ 'content-type': 'application/json' }) }),
    );
  }
  const bodyOf = (call: number) => JSON.parse(fetchSpy.mock.calls[call][1].body);
  const urlOf = (call: number) => String(fetchSpy.mock.calls[call][0]);

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    events = new WildwoodEventEmitter();
    auth = new AuthService(new HttpClient(createConfig()), new MemoryStorageAdapter(), events);
    source = { getForRegistration: vi.fn(() => payload), clear: vi.fn() };
    auth.setAttributionProvider(source);
  });

  it('register attaches the captured payload and clears it after a token response', async () => {
    respond(mockAuthResponse());

    await auth.register(registration);

    expect(bodyOf(0).attribution).toEqual(payload);
    expect(source.clear).toHaveBeenCalledTimes(1);
  });

  it('register omits attribution when nothing was captured', async () => {
    source.getForRegistration.mockReturnValue(null);
    respond(mockAuthResponse());

    await auth.register(registration);

    expect('attribution' in bodyOf(0)).toBe(false);
  });

  it('register sends no attribution when the caller passes null', async () => {
    respond(mockAuthResponse());

    await auth.register({ ...registration, attribution: null });

    expect('attribution' in bodyOf(0)).toBe(false);
    expect(source.getForRegistration).not.toHaveBeenCalled();
  });

  it('register keeps the payload when the request fails', async () => {
    respond({ message: 'Email already registered' }, 400);

    await expect(auth.register(registration)).rejects.toBeDefined();

    expect(source.clear).not.toHaveBeenCalled();
  });

  it('registerWithToken attaches Attribution and clears it on success', async () => {
    respond({ success: true, message: 'ok', userId: 'user-9' });

    await auth.registerWithToken({ ...registration, registrationToken: 'token-1' });

    expect(bodyOf(0).Attribution).toEqual(payload);
    expect(source.clear).toHaveBeenCalledTimes(1);
  });

  it('registerWithToken keeps the payload on a token-less failure', async () => {
    respond({ success: false, message: 'Invalid token' });

    await expect(auth.registerWithToken({ ...registration, registrationToken: 'token-1' })).rejects.toThrow(
      'Invalid token',
    );

    expect(source.clear).not.toHaveBeenCalled();
  });

  it('registerOpen attaches Attribution and clears it only on success', async () => {
    respond({ success: false, message: 'Registration is closed' });
    await auth.registerOpen(registration);
    expect(bodyOf(0).Attribution).toEqual(payload);
    expect(source.clear).not.toHaveBeenCalled();

    respond({ success: true, message: 'ok', userId: 'user-9' });
    await auth.registerOpen(registration);
    expect(source.clear).toHaveBeenCalledTimes(1);
  });

  it('a provider login claims the attribution for the new account', async () => {
    respond(mockAuthResponse());
    respond({ recorded: true, reason: null });

    await auth.loginWithProvider('Google', 'provider-token', 'app-1');

    await vi.waitFor(() => expect(source.clear).toHaveBeenCalledTimes(1));
    expect(urlOf(1)).toContain('api/attribution/claim?appId=app-1');
    expect(bodyOf(1)).toEqual({ appId: 'app-1', ...payload });
  });

  it('a provider login deferred by two-factor claims once verification signs in', async () => {
    respond(mockAuthResponse({ requiresTwoFactor: true, jwtToken: '', refreshToken: '', twoFactorSessionId: 's-1' }));
    await auth.loginWithProvider('Google', 'provider-token', 'app-1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    respond({ success: true, authResponse: mockAuthResponse() });
    respond({ recorded: true, reason: null });
    await auth.verifyTwoFactorCode({ sessionId: 's-1', code: '123456' } as Parameters<
      AuthService['verifyTwoFactorCode']
    >[0]);

    await vi.waitFor(() => expect(source.clear).toHaveBeenCalledTimes(1));
    expect(urlOf(2)).toContain('api/attribution/claim?appId=app-1');
  });

  it('a queued claim waits for a signed-in authChanged and a sign-out drops it', async () => {
    auth.queueAttributionClaim('app-1');
    events.emit('authChanged', mockAuthResponse({ jwtToken: '' }));
    events.emit('authChanged', null);
    events.emit('authChanged', mockAuthResponse());
    expect(source.getForRegistration).not.toHaveBeenCalled();

    auth.queueAttributionClaim('app-1');
    respond({ recorded: true, reason: null });
    events.emit('authChanged', mockAuthResponse());

    await vi.waitFor(() => expect(source.clear).toHaveBeenCalledTimes(1));
    expect(urlOf(0)).toContain('api/attribution/claim?appId=app-1');
  });

  it('a queued claim lapses after the claim window', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-13T12:00:00Z'));
      auth.queueAttributionClaim('app-1');
      vi.setSystemTime(new Date('2026-09-13T12:16:00Z'));

      events.emit('authChanged', mockAuthResponse());

      expect(source.getForRegistration).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a queued claim still goes out after every listener was removed (client disposed and remounted)', async () => {
    events.removeAllListeners();
    auth.queueAttributionClaim('app-1');
    respond({ recorded: true, reason: null });

    events.emit('authChanged', mockAuthResponse());

    await vi.waitFor(() => expect(source.clear).toHaveBeenCalledTimes(1));
  });

  it('a claim is sent at most once per queue', async () => {
    auth.queueAttributionClaim('app-1');
    respond({ recorded: true, reason: null });

    events.emit('authChanged', mockAuthResponse());
    events.emit('authChanged', mockAuthResponse());

    await vi.waitFor(() => expect(source.clear).toHaveBeenCalledTimes(1));
    expect(source.getForRegistration).toHaveBeenCalledTimes(1);
  });

  it('a password login does not claim', async () => {
    respond(mockAuthResponse());

    await auth.login({ username: 'john', password: 'pass', appId: 'app-1' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('claimAttribution sends nothing without a payload and never throws on failure', async () => {
    source.getForRegistration.mockReturnValue(null);
    expect(await auth.claimAttribution('app-1')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    source.getForRegistration.mockReturnValue(payload);
    respond({ message: 'Unauthorized' }, 401);
    expect(await auth.claimAttribution('app-1')).toBeNull();
    expect(source.clear).not.toHaveBeenCalled();
  });
});
