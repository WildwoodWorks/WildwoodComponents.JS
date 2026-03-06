// Authentication service - ported from WildwoodComponents.Blazor/Services/AuthenticationService.cs
// Handles login, registration, password reset, passkeys, 2FA, and provider configuration

import type { HttpClient } from '../client/httpClient.js';
import type { StorageAdapter } from '../platform/types.js';
import type { WildwoodEventEmitter } from '../events/eventEmitter.js';
import type {
  LoginRequest,
  RegistrationRequest,
  AuthenticationResponse,
  AuthProvider,
  AppComponentAuthProvidersResponse,
  AuthenticationConfiguration,
  CaptchaConfiguration,
  TwoFactorSendCodeResponse,
  TwoFactorVerifyRequest,
  TwoFactorVerifyResponse,
} from './types.js';

const STORAGE_KEYS = {
  accessToken: 'ww_accessToken',
  refreshToken: 'ww_refreshToken',
  user: 'ww_user',
} as const;

export class AuthService {
  private onAuthChanged: ((response: AuthenticationResponse) => void) | null = null;
  private onLogout: (() => void) | null = null;

  constructor(
    private http: HttpClient,
    private storage: StorageAdapter,
    private events: WildwoodEventEmitter,
  ) {}

  /** Register a callback for auth state changes (used by SessionManager) */
  setAuthChangedHandler(handler: (response: AuthenticationResponse) => void): void {
    this.onAuthChanged = handler;
  }

  /** Register a callback for logout (used by SessionManager) */
  setLogoutHandler(handler: () => void): void {
    this.onLogout = handler;
  }

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------

  async login(request: LoginRequest): Promise<AuthenticationResponse> {
    const loginDto = {
      Username: request.username,
      Email: request.email,
      Password: request.password,
      AppId: request.appId,
      Platform: request.platform,
      DeviceInfo: request.deviceInfo,
      ProviderName: request.providerName,
      ProviderToken: request.providerToken,
      TrustedDeviceToken: request.trustedDeviceToken,
      AppVersion: '1.0.0',
    };

    const { data } = await this.http.post<AuthenticationResponse>('api/auth/login', loginDto, { skipAuth: true });

    // If 2FA is required, return without storing auth
    if (data.requiresTwoFactor) {
      return data;
    }

    await this.storeAuthentication(data);
    this.onAuthChanged?.(data);
    this.events.emit('authChanged', data);
    return data;
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  async register(request: RegistrationRequest): Promise<AuthenticationResponse> {
    const { data } = await this.http.post<AuthenticationResponse>('api/auth/register', request, { skipAuth: true });

    if (data.jwtToken) {
      await this.storeAuthentication(data);
      this.onAuthChanged?.(data);
      this.events.emit('authChanged', data);
    }
    return data;
  }

  async registerWithToken(request: RegistrationRequest): Promise<AuthenticationResponse> {
    const tokenRegistrationDto = {
      Token: request.registrationToken,
      Username: request.username ?? request.email,
      Email: request.email,
      Password: request.password,
      FirstName: request.firstName,
      LastName: request.lastName,
      AppId: request.appId,
      Platform: request.platform,
      DeviceInfo: request.deviceInfo,
    };

    const { data } = await this.http.post<AuthenticationResponse>(
      'api/userregistration/register-with-token',
      tokenRegistrationDto,
      { skipAuth: true },
    );

    if (data.jwtToken) {
      await this.storeAuthentication(data);
      this.onAuthChanged?.(data);
      this.events.emit('authChanged', data);
    }
    return data;
  }

  // ---------------------------------------------------------------------------
  // Provider Configuration
  // ---------------------------------------------------------------------------

  async getAvailableProviders(appId?: string): Promise<AuthProvider[]> {
    try {
      if (appId) {
        const { data } = await this.http.get<AppComponentAuthProvidersResponse>(
          `api/AppComponentConfigurations/${appId}/auth-providers`,
          { skipAuth: true },
        );
        if (!data?.authProviders) return [];
        const enabled: AuthProvider[] = [];
        for (const p of data.authProviders) {
          if (p.isEnabled) {
            enabled.push({
              name: p.providerName,
              displayName: p.displayName,
              icon: p.icon,
              isEnabled: p.isEnabled,
              clientId: p.clientId,
              redirectUri: p.redirectUri,
            });
          }
        }
        enabled.sort((a, b) => a.displayName.localeCompare(b.displayName));
        return enabled;
      }

      const { data } = await this.http.get<AuthProvider[]>('api/auth/providers', { skipAuth: true });
      return data ?? [];
    } catch {
      return [];
    }
  }

  async getCaptchaConfiguration(appId: string): Promise<CaptchaConfiguration | null> {
    try {
      if (!appId) return null;
      const { data } = await this.http.get<CaptchaConfiguration>(
        `api/AppComponentConfigurations/${appId}/captcha`,
        { skipAuth: true },
      );
      return data ?? null;
    } catch {
      return null;
    }
  }

  async getAuthenticationConfiguration(appId: string): Promise<AuthenticationConfiguration | null> {
    try {
      const { data } = await this.http.get<AuthenticationConfiguration>(
        `api/AppComponentConfigurations/${appId}/auth-configuration`,
        { skipAuth: true },
      );
      return data ?? null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Password
  // ---------------------------------------------------------------------------

  async validatePassword(password: string, appId: string): Promise<{ isValid: boolean; errorMessage: string }> {
    if (!password) return { isValid: false, errorMessage: 'Password is required.' };

    const config = await this.getAuthenticationConfiguration(appId);
    if (!config) return { isValid: true, errorMessage: '' };
    return this.checkPasswordRules(password, config);
  }

  getPasswordRequirementsText(config: AuthenticationConfiguration): string {
    const reqs: string[] = [`at least ${config.passwordMinimumLength} characters`];
    if (config.passwordRequireUppercase) reqs.push('uppercase letters (A-Z)');
    if (config.passwordRequireLowercase) reqs.push('lowercase letters (a-z)');
    if (config.passwordRequireDigit) reqs.push('numbers (0-9)');
    if (config.passwordRequireSpecialChar) reqs.push('special characters (!@#$%^&*)');

    if (reqs.length === 1) return `Password must have ${reqs[0]}.`;
    if (reqs.length === 2) return `Password must have ${reqs[0]} and ${reqs[1]}.`;
    const last = reqs.pop()!;
    return `Password must have ${reqs.join(', ')}, and ${last}.`;
  }

  async requestPasswordReset(email: string, appId: string): Promise<boolean> {
    await this.http.post('api/auth/forgot-password', { Email: email, AppId: appId }, { skipAuth: true });
    return true;
  }

  async resetPassword(newPassword: string, confirmPassword: string, appId: string): Promise<boolean> {
    await this.http.post('api/auth/reset-password', {
      NewPassword: newPassword,
      ConfirmPassword: confirmPassword,
      AppId: appId,
    });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Token / License Validation
  // ---------------------------------------------------------------------------

  async validateLicenseToken(token: string): Promise<boolean> {
    try {
      const { data } = await this.http.post<{ isValid: boolean }>('api/auth/validate-license', { Token: token }, { skipAuth: true });
      return data?.isValid ?? false;
    } catch {
      return false;
    }
  }

  async hasRegistrationTokens(appId: string): Promise<boolean> {
    try {
      const { data } = await this.http.get<boolean>(`api/registrationtokens/app/${appId}/has-tokens`, { skipAuth: true });
      return data ?? false;
    } catch {
      return false;
    }
  }

  async validateRegistrationToken(token: string): Promise<boolean> {
    try {
      const { data } = await this.http.get<boolean>(`api/registrationtokens/validate-simple/${token}`, { skipAuth: true });
      return data ?? false;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Logout / Refresh
  // ---------------------------------------------------------------------------

  async logout(): Promise<void> {
    try {
      await this.http.post('api/auth/logout');
    } catch {
      // Best-effort server logout
    } finally {
      await this.clearAuthentication();
      this.onLogout?.();
      this.events.emit('authChanged', null);
    }
  }

  async refreshToken(): Promise<boolean> {
    const refreshToken = await this.storage.getItem(STORAGE_KEYS.refreshToken);
    if (!refreshToken) return false;

    try {
      const { data } = await this.http.post<AuthenticationResponse>(
        'api/auth/refresh-token',
        { RefreshToken: refreshToken },
        { skipAuth: true },
      );

      if (data?.jwtToken) {
        await this.storeAuthentication(data);
        this.onAuthChanged?.(data);
        this.events.emit('tokenRefreshed', data.jwtToken);
        return true;
      }
      return false;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      // Only clear tokens on explicit rejection (400/401), not server errors
      if (status === 400 || status === 401) {
        await this.clearAuthentication();
      }
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Passkey / WebAuthn
  // ---------------------------------------------------------------------------

  async getPasskeyAuthenticationOptions(appId: string): Promise<unknown> {
    const { data } = await this.http.post<unknown>('api/webauthn/authenticate/options', { AppId: appId });
    return data;
  }

  async verifyPasskeyAuthentication(appId: string, credential: unknown): Promise<AuthenticationResponse> {
    const cred = credential as Record<string, unknown>;
    const credResponse = cred.response as Record<string, unknown>;
    const request = {
      AppId: appId,
      Id: cred.id,
      RawId: cred.rawId,
      Type: cred.type,
      Response: {
        ClientDataJSON: credResponse.clientDataJSON,
        AuthenticatorData: credResponse.authenticatorData,
        Signature: credResponse.signature,
        UserHandle: credResponse.userHandle ?? null,
      },
    };

    const { data } = await this.http.post<AuthenticationResponse>('api/webauthn/authenticate', request);
    await this.storeAuthentication(data);
    this.onAuthChanged?.(data);
    this.events.emit('authChanged', data);
    return data;
  }

  async getPasskeyRegistrationOptions(appId: string): Promise<unknown> {
    const { data } = await this.http.post<unknown>('api/webauthn/register/options', { AppId: appId });
    return data;
  }

  async completePasskeyRegistration(appId: string, credential: unknown): Promise<void> {
    const cred = credential as Record<string, unknown>;
    const credResponse = cred.response as Record<string, unknown>;
    const request = {
      AppId: appId,
      Id: cred.id,
      RawId: cred.rawId,
      Type: cred.type,
      Response: {
        ClientDataJSON: credResponse.clientDataJSON,
        AttestationObject: credResponse.attestationObject,
        Transports: credResponse.transports ?? null,
      },
    };

    await this.http.post('api/webauthn/register', request);
  }

  // ---------------------------------------------------------------------------
  // Two-Factor Authentication
  // ---------------------------------------------------------------------------

  async sendTwoFactorCode(sessionId: string): Promise<TwoFactorSendCodeResponse> {
    try {
      const { data } = await this.http.post<TwoFactorSendCodeResponse>(
        'api/twofactor/send-code',
        { SessionId: sessionId } satisfies Record<string, string>,
        { skipAuth: true },
      );
      return data;
    } catch {
      return { success: false, errorMessage: 'Failed to send verification code' };
    }
  }

  async verifyTwoFactorCode(request: TwoFactorVerifyRequest): Promise<TwoFactorVerifyResponse> {
    try {
      const { data } = await this.http.post<TwoFactorVerifyResponse>('api/twofactor/verify', request, { skipAuth: true });
      if (data.success && data.authResponse) {
        await this.storeAuthentication(data.authResponse);
        this.onAuthChanged?.(data.authResponse);
        this.events.emit('authChanged', data.authResponse);
      }
      return data;
    } catch {
      return { success: false, errorMessage: 'Verification failed' };
    }
  }

  async verifyTwoFactorRecoveryCode(
    sessionId: string,
    recoveryCode: string,
    ipAddress: string,
  ): Promise<TwoFactorVerifyResponse> {
    try {
      const { data } = await this.http.post<TwoFactorVerifyResponse>(
        'api/twofactor/recovery',
        { SessionId: sessionId, RecoveryCode: recoveryCode, IpAddress: ipAddress },
        { skipAuth: true },
      );
      if (data.success && data.authResponse) {
        await this.storeAuthentication(data.authResponse);
        this.onAuthChanged?.(data.authResponse);
        this.events.emit('authChanged', data.authResponse);
      }
      return data;
    } catch {
      return { success: false, errorMessage: 'Recovery code verification failed' };
    }
  }

  // ---------------------------------------------------------------------------
  // Internal Storage
  // ---------------------------------------------------------------------------

  private async storeAuthentication(response: AuthenticationResponse): Promise<void> {
    if (response.jwtToken) {
      await this.storage.setItem(STORAGE_KEYS.accessToken, response.jwtToken);
    }
    if (response.refreshToken) {
      await this.storage.setItem(STORAGE_KEYS.refreshToken, response.refreshToken);
    }
    await this.storage.setItem(STORAGE_KEYS.user, JSON.stringify(response));
  }

  private async clearAuthentication(): Promise<void> {
    await this.storage.removeItem(STORAGE_KEYS.accessToken);
    await this.storage.removeItem(STORAGE_KEYS.refreshToken);
    await this.storage.removeItem(STORAGE_KEYS.user);
  }

  /** Get the stored access token (used by SessionManager for initialization) */
  async getStoredAccessToken(): Promise<string | null> {
    return this.storage.getItem(STORAGE_KEYS.accessToken);
  }

  /** Get stored refresh token */
  async getStoredRefreshToken(): Promise<string | null> {
    return this.storage.getItem(STORAGE_KEYS.refreshToken);
  }

  /** Get stored user data */
  async getStoredUser(): Promise<AuthenticationResponse | null> {
    const json = await this.storage.getItem(STORAGE_KEYS.user);
    if (!json) return null;
    try {
      return JSON.parse(json) as AuthenticationResponse;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Password Validation (client-side)
  // ---------------------------------------------------------------------------

  private checkPasswordRules(
    password: string,
    config: AuthenticationConfiguration,
  ): { isValid: boolean; errorMessage: string } {
    if (password.length < config.passwordMinimumLength) {
      return { isValid: false, errorMessage: `Password must be at least ${config.passwordMinimumLength} characters long.` };
    }
    if (config.passwordRequireUppercase && !/[A-Z]/.test(password)) {
      return { isValid: false, errorMessage: 'Password must contain at least one uppercase letter (A-Z).' };
    }
    if (config.passwordRequireLowercase && !/[a-z]/.test(password)) {
      return { isValid: false, errorMessage: 'Password must contain at least one lowercase letter (a-z).' };
    }
    if (config.passwordRequireDigit && !/\d/.test(password)) {
      return { isValid: false, errorMessage: 'Password must contain at least one number (0-9).' };
    }
    if (config.passwordRequireSpecialChar && !/[^a-zA-Z0-9]/.test(password)) {
      return { isValid: false, errorMessage: 'Password must contain at least one special character (!@#$%^&*).' };
    }
    return { isValid: true, errorMessage: '' };
  }
}
