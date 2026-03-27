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
    const { data } = await this.http.get<TwoFactorUserStatus>('api/twofactor/status');
    return data;
  }

  // Credentials
  async getCredentials(): Promise<TwoFactorCredential[]> {
    const { data } = await this.http.get<TwoFactorCredential[]>('api/twofactor/credentials');
    return data ?? [];
  }

  async setPrimaryCredential(credentialId: string): Promise<boolean> {
    try {
      await this.http.put(`api/twofactor/credentials/${credentialId}/primary`);
      return true;
    } catch {
      return false;
    }
  }

  async removeCredential(credentialId: string): Promise<boolean> {
    try {
      await this.http.delete(`api/twofactor/credentials/${credentialId}`);
      return true;
    } catch {
      return false;
    }
  }

  // Email enrollment
  async enrollEmail(email?: string): Promise<EmailEnrollmentResult> {
    const { data } = await this.http.post<EmailEnrollmentResult>('api/twofactor/enroll/email', { email });
    return data;
  }

  async verifyEmailEnrollment(credentialId: string, code: string): Promise<boolean> {
    try {
      await this.http.post('api/twofactor/enroll/email/verify', { credentialId, code });
      return true;
    } catch {
      return false;
    }
  }

  // Authenticator enrollment
  async beginAuthenticatorEnrollment(friendlyName?: string): Promise<AuthenticatorEnrollmentResult> {
    const { data } = await this.http.post<AuthenticatorEnrollmentResult>('api/twofactor/enroll/authenticator', {
      friendlyName,
    });
    return data;
  }

  async completeAuthenticatorEnrollment(credentialId: string, code: string): Promise<boolean> {
    try {
      await this.http.post('api/twofactor/enroll/authenticator/verify', { credentialId, code });
      return true;
    } catch {
      return false;
    }
  }

  // Recovery codes
  async getRecoveryCodeInfo(): Promise<RecoveryCodeInfo> {
    const { data } = await this.http.get<RecoveryCodeInfo>('api/twofactor/recovery-codes/info');
    return data;
  }

  async regenerateRecoveryCodes(): Promise<RegenerateRecoveryCodesResult> {
    const { data } = await this.http.post<RegenerateRecoveryCodesResult>('api/twofactor/recovery-codes/regenerate');
    return data;
  }

  // Trusted devices
  async getTrustedDevices(): Promise<TrustedDevice[]> {
    const { data } = await this.http.get<TrustedDevice[]>('api/twofactor/trusted-devices');
    return data ?? [];
  }

  async revokeTrustedDevice(deviceId: string): Promise<boolean> {
    try {
      await this.http.delete(`api/twofactor/trusted-devices/${deviceId}`);
      return true;
    } catch {
      return false;
    }
  }

  async revokeAllTrustedDevices(): Promise<number> {
    const { data } = await this.http.delete<{ revokedCount: number }>('api/twofactor/trusted-devices');
    return data?.revokedCount ?? 0;
  }
}
