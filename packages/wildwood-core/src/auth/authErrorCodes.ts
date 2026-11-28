// Known error codes returned by WildwoodAPI auth endpoints.
// Mirrors WildwoodComponents.Shared/Models/AuthErrorCodes.cs.

export const AuthErrorCodes = {
  InvalidApplication: 'InvalidApplication',
  InvalidCredentials: 'InvalidCredentials',
  NotAuthorizedForApplication: 'NotAuthorizedForApplication',
  AccountDeactivated: 'AccountDeactivated',
  TemporaryPasswordExpired: 'TemporaryPasswordExpired',
  UserExists: 'USER_EXISTS',
  /**
   * The app requires two-factor authentication and the signed-in user has not enrolled. Arrives on a
   * 403 for every call but enrollment; `WildwoodError.code` is `TwoFactorEnrollmentRequired` then.
   */
  TwoFactorEnrollmentRequired: 'TWO_FACTOR_ENROLLMENT_REQUIRED',
} as const;

export type AuthErrorCode = (typeof AuthErrorCodes)[keyof typeof AuthErrorCodes];
