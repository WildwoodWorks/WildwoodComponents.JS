// Auth types - ported from WildwoodComponents.Blazor/Models/ComponentModels.cs
// and WildwoodComponents.Shared/Models/WildwoodAuthModels.cs

export interface LoginRequest {
  username: string;
  email?: string;
  password?: string;
  providerName?: string;
  providerToken?: string;
  appId?: string;
  rememberMe?: boolean;
  captchaResponse?: string;
  licenseToken?: string;
  platform?: string;
  deviceInfo?: string;
  trustedDeviceToken?: string;
}

export interface RegistrationRequest {
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  password?: string;
  confirmPassword?: string;
  providerName?: string;
  providerToken?: string;
  appId: string;
  platform?: string;
  deviceInfo?: string;
  phoneNumber?: string;
  captchaResponse?: string;
  licenseToken?: string;
  registrationToken?: string;
}

/** Collected registration form data (not yet submitted to API). Used by deferred registration flows. */
export interface RegistrationFormData {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  registrationToken?: string;
  useToken: boolean;
}

export interface AuthenticationResponse {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  jwtToken: string;
  refreshToken: string;
  requiresTwoFactor: boolean;
  requiresPasswordReset: boolean;
  roles: string[];
  companyId?: string;
  permissions: string[];
  twoFactorSessionId?: string;
  availableTwoFactorMethods?: TwoFactorMethodInfo[];
  defaultTwoFactorMethod?: string;
  twoFactorSessionExpiresIn?: number;
  requiresDisclaimerAcceptance: boolean;
  pendingDisclaimers?: PendingDisclaimerModel[];
}

export interface TwoFactorMethodInfo {
  providerType: string;
  name: string;
  icon: string;
  maskedDestination?: string;
}

export interface TwoFactorVerifyRequest {
  sessionId: string;
  code: string;
  providerType: string;
  rememberDevice?: boolean;
  deviceFingerprint?: string;
  deviceName?: string;
}

export interface TwoFactorVerifyResponse {
  success: boolean;
  errorMessage?: string;
  authResponse?: AuthenticationResponse;
  trustedDeviceToken?: string;
}

export interface TwoFactorSendCodeRequest {
  sessionId: string;
}

export interface TwoFactorSendCodeResponse {
  success: boolean;
  maskedDestination?: string;
  expiresInSeconds?: number;
  errorMessage?: string;
}

export interface AuthProvider {
  name: string;
  displayName: string;
  icon: string;
  isEnabled: boolean;
  clientId?: string;
  redirectUri?: string;
}

export interface AuthProviderDetails {
  id: string;
  providerName: string;
  displayName: string;
  icon: string;
  isEnabled: boolean;
  displayOrder: number;
  buttonText?: string;
  buttonColor?: string;
  clientId?: string;
  redirectUri?: string;
  authUrl?: string;
  tokenUrl?: string;
  scope?: string;
}

export interface AppComponentAuthProvidersResponse {
  id: string;
  appId: string;
  isEnabled: boolean;
  defaultProvider: string;
  allowLocalAuth: boolean;
  requireEmailVerification: boolean;
  allowTokenRegistration: boolean;
  allowOpenRegistration: boolean;
  allowPasswordReset: boolean;
  passwordMinimumLength: number;
  passwordRequireDigit: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireUppercase: boolean;
  passwordRequireSpecialChar: boolean;
  passwordHistoryLimit: number;
  passwordExpiryDays: number;
  authProviders: AuthProviderDetails[];
}

export interface AuthenticationConfiguration {
  isEnabled: boolean;
  defaultProvider: string;
  allowLocalAuth: boolean;
  requireEmailVerification: boolean;
  allowPasswordReset: boolean;
  showDetailedErrors: boolean;
  allowTokenRegistration: boolean;
  allowOpenRegistration: boolean;
  defaultPricingModelId?: string;
  defaultPricingModelName?: string;
  requireEmailVerificationForOpenRegistration: boolean;
  hasEmailConfiguration: boolean;
  registrationRateLimitPerHour: number;
  registrationRateLimitPerDay: number;
  registrationRateLimitPerIpPerHour: number;
  passwordMinimumLength: number;
  passwordRequireDigit: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireUppercase: boolean;
  passwordRequireSpecialChar: boolean;
  passwordHistoryLimit: number;
  passwordExpiryDays: number;
}

export interface CaptchaConfiguration {
  isEnabled: boolean;
  providerType: string;
  siteKey?: string;
  minimumScore: number;
  requireForLogin: boolean;
  requireForRegistration: boolean;
  requireForPasswordReset: boolean;
}

export interface ForgotPasswordRequest {
  email: string;
  appId: string;
}

export interface ResetPasswordRequest {
  newPassword: string;
  confirmPassword: string;
  appId: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// Re-export disclaimer model used in auth response
export interface ValidateRegistrationRequest {
  username?: string;
  email: string;
  password: string;
  token?: string;
  appId: string;
}

export interface ValidateRegistrationResponse {
  usernameAvailable: boolean;
  emailAvailable: boolean;
  passwordValid: boolean;
  passwordErrors: string[];
}

export interface PendingDisclaimerModel {
  disclaimerId: string;
  versionId: string;
  title: string;
  disclaimerType: string;
  versionNumber: number;
  content: string;
  contentFormat: string;
  isRequired: boolean;
  previouslyAcceptedVersion?: number;
  changeNotes?: string;
  isAccepted?: boolean;
}
