// Two-factor and security types - ported from WildwoodComponents.Shared/Models/TwoFactorSettingsModels.cs

export interface TwoFactorUserStatus {
  isEnabled: boolean;
  methodCount: number;
  availableMethods: string[];
  primaryMethod?: string;
  recoveryCodesRemaining: number;
  trustedDevicesCount: number;
  isRequired: boolean;
  lastUsedAt?: string;
}

export interface TwoFactorCredential {
  id: string;
  providerType: string;
  displayName: string;
  isPrimary: boolean;
  isActive: boolean;
  isVerified: boolean;
  maskedEmail?: string;
  lastUsedAt?: string;
  usageCount: number;
  createdAt: string;
}

export interface EmailEnrollmentResult {
  success: boolean;
  credentialId: string;
  maskedEmail: string;
  expiresIn: number;
  message?: string;
}

export interface AuthenticatorEnrollmentResult {
  success: boolean;
  credentialId: string;
  secret: string;
  qrCodeDataUrl: string;
  manualEntryKey: string;
  issuer?: string;
  accountName?: string;
  message?: string;
}

export interface RecoveryCodeInfo {
  totalGenerated: number;
  remaining: number;
  generatedAt?: string;
}

export interface RegenerateRecoveryCodesResult {
  success: boolean;
  codes: string[];
  totalCodes: number;
  message?: string;
}

export interface TrustedDevice {
  id: string;
  deviceName: string;
  location?: string;
  lastUsedAt?: string;
  usageCount: number;
  expiresAt: string;
  createdAt: string;
  isExpired: boolean;
}
