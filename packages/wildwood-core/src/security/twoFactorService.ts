// Two-factor settings service - ported from WildwoodComponents.Blazor/Services/TwoFactorSettingsService.cs

import type { HttpClient } from '../client/httpClient.js';
import type {
  TwoFactorUserStatus,
  TwoFactorCredential,
  EmailEnrollmentResult,
  AuthenticatorEnrollmentResult,
  RecoveryCodeInfo,
  RegenerateRecoveryCodesResult,
  TrustedDevice,
} from './types.js';

export class TwoFactorService {
  constructor(private http: HttpClient) {}

  // Status
  async getStatus(): Promise<TwoFactorUserStatus> {
    const { data } = await this.http.get<TwoFactorUserStatus>('api/twofactor/settings/status');
    return data;
  }

  // Credentials
  async getCredentials(): Promise<TwoFactorCredential[]> {
    const { data } = await this.http.get<TwoFactorCredential[]>('api/twofactor/settings/credentials');
    return data ?? [];
  }

  async setPrimaryCredential(credentialId: string): Promise<boolean> {
    try {
      await this.http.post(`api/twofactor/settings/credentials/${credentialId}/primary`);
      return true;
    } catch {
      return false;
    }
  }

  async removeCredential(credentialId: string): Promise<boolean> {
    try {
      await this.http.delete(`api/twofactor/settings/credentials/${credentialId}`);
      return true;
    } catch {
      return false;
    }
  }

  // Email enrollment
  async enrollEmail(email?: string): Promise<EmailEnrollmentResult> {
    const { data } = await this.http.post<EmailEnrollmentResult>('api/twofactor/settings/enroll/email', { email });
    return data;
  }

  async verifyEmailEnrollment(credentialId: string, code: string): Promise<boolean> {
    try {
      await this.http.post(`api/twofactor/settings/enroll/email/${credentialId}/verify`, { code });
      return true;
    } catch {
      return false;
    }
  }

  // Authenticator enrollment
  async beginAuthenticatorEnrollment(friendlyName?: string): Promise<AuthenticatorEnrollmentResult> {
    const { data } = await this.http.post<AuthenticatorEnrollmentResult>(
      'api/twofactor/settings/enroll/authenticator',
      { friendlyName },
    );
    return data;
  }

  async completeAuthenticatorEnrollment(credentialId: string, code: string): Promise<boolean> {
    try {
      await this.http.post(`api/twofactor/settings/enroll/authenticator/${credentialId}/verify`, { code });
      return true;
    } catch {
      return false;
    }
  }

  // Recovery codes
  async getRecoveryCodeInfo(): Promise<RecoveryCodeInfo> {
    const { data } = await this.http.get<RecoveryCodeInfo>('api/twofactor/settings/recovery-codes');
    return data;
  }

  async regenerateRecoveryCodes(): Promise<RegenerateRecoveryCodesResult> {
    const { data } = await this.http.post<RegenerateRecoveryCodesResult>(
      'api/twofactor/settings/recovery-codes/regenerate',
    );
    return data;
  }

  // Trusted devices
  async getTrustedDevices(): Promise<TrustedDevice[]> {
    const { data } = await this.http.get<TrustedDevice[]>('api/twofactor/settings/trusted-devices');
    return data ?? [];
  }

  async revokeTrustedDevice(deviceId: string): Promise<boolean> {
    try {
      await this.http.delete(`api/twofactor/settings/trusted-devices/${deviceId}`);
      return true;
    } catch {
      return false;
    }
  }

  async revokeAllTrustedDevices(): Promise<number> {
    const { data } = await this.http.post<{ revokedCount: number }>(
      'api/twofactor/settings/trusted-devices/revoke-all',
    );
    return data?.revokedCount ?? 0;
  }
}
