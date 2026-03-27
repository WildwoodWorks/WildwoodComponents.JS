import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../auth/authService.js';
import { HttpClient } from '../client/httpClient.js';
import { WildwoodEventEmitter } from '../events/eventEmitter.js';
import { MemoryStorageAdapter } from '../platform/storageService.js';
import type { AuthenticationResponse } from '../auth/types.js';

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
  });
});
