import type { AuthenticationConfiguration } from './types.js';

export function validatePasswordClientSide(
  password: string,
  config: AuthenticationConfiguration,
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < config.passwordMinimumLength) {
    errors.push(`Password must be at least ${config.passwordMinimumLength} characters long.`);
  }
  if (config.passwordRequireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter (A-Z).');
  }
  if (config.passwordRequireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter (a-z).');
  }
  if (config.passwordRequireDigit && !/\d/.test(password)) {
    errors.push('Password must contain at least one number (0-9).');
  }
  if (config.passwordRequireSpecialChar && !/[^a-zA-Z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character.');
  }

  return { isValid: errors.length === 0, errors };
}
