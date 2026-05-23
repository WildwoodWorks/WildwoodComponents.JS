// Known error codes returned by WildwoodAPI auth endpoints.
// Mirrors WildwoodComponents.Shared/Models/AuthErrorCodes.cs.

export const AuthErrorCodes = {
  InvalidApplication: 'InvalidApplication',
  InvalidCredentials: 'InvalidCredentials',
  NotAuthorizedForApplication: 'NotAuthorizedForApplication',
  AccountDeactivated: 'AccountDeactivated',
  UserExists: 'USER_EXISTS',
} as const;

export type AuthErrorCode = (typeof AuthErrorCodes)[keyof typeof AuthErrorCodes];
