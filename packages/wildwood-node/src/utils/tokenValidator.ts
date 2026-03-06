export interface TokenPayload {
  sub: string;
  email: string;
  given_name?: string;
  family_name?: string;
  app_id?: string;
  company_id?: string;
  role?: string | string[];
  exp: number;
  iat: number;
  iss: string;
  aud: string;
  [key: string]: unknown;
}

export interface TokenValidationOptions {
  issuer?: string;
  audience?: string;
  clockToleranceSeconds?: number;
}

/**
 * Decode a JWT token without cryptographic verification.
 * For server-side use where the token has already been validated by the API,
 * or for extracting claims before forwarding to the API for full validation.
 */
export function decodeToken(token: string): TokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const payload = parts[1];
  const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
  return JSON.parse(decoded) as TokenPayload;
}

export function isTokenExpired(token: string, clockToleranceSeconds = 0): boolean {
  const payload = decodeToken(token);
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now - clockToleranceSeconds;
}

export function validateTokenClaims(
  token: string,
  options: TokenValidationOptions = {},
): { valid: boolean; error?: string; payload?: TokenPayload } {
  try {
    const payload = decodeToken(token);
    const now = Math.floor(Date.now() / 1000);
    const tolerance = options.clockToleranceSeconds ?? 0;

    if (payload.exp < now - tolerance) {
      return { valid: false, error: 'Token has expired' };
    }

    if (options.issuer && payload.iss !== options.issuer) {
      return { valid: false, error: `Invalid issuer: expected ${options.issuer}, got ${payload.iss}` };
    }

    if (options.audience && payload.aud !== options.audience) {
      return { valid: false, error: `Invalid audience: expected ${options.audience}, got ${payload.aud}` };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Token decode failed' };
  }
}

export function extractRoles(payload: TokenPayload): string[] {
  if (!payload.role) return [];
  return Array.isArray(payload.role) ? payload.role : [payload.role];
}
