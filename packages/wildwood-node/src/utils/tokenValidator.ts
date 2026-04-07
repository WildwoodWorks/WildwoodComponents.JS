import type { JwksClient, JwksKey } from './jwksClient.js';
import { verifyRS256Signature } from './jwksClient.js';

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

export interface TokenVerificationOptions extends TokenValidationOptions {
  /** JWKS client for RS256 signature verification */
  jwksClient: JwksClient;
}

interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
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

/** Decode the JWT header to extract algorithm and kid */
export function decodeTokenHeader(token: string): JwtHeader {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const header = parts[0];
  const decoded = Buffer.from(header, 'base64url').toString('utf-8');
  return JSON.parse(decoded) as JwtHeader;
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

/**
 * Verify a JWT token's RS256 signature using JWKS and validate its claims.
 * This is the recommended approach for server-side token validation.
 *
 * @example
 * ```ts
 * import { createJwksClient } from '@wildwood/node';
 * import { verifyToken } from '@wildwood/node';
 *
 * const jwksClient = createJwksClient('https://api.wildwoodworks.io');
 * const result = await verifyToken(token, {
 *   jwksClient,
 *   issuer: 'WildwoodAPI',
 *   audience: 'WildwoodAPI_Clients',
 * });
 *
 * if (result.valid) {
 *   console.log('User:', result.payload.sub);
 * }
 * ```
 */
export async function verifyToken(
  token: string,
  options: TokenVerificationOptions,
): Promise<{ valid: boolean; error?: string; payload?: TokenPayload }> {
  try {
    // Decode header to get kid and algorithm
    const header = decodeTokenHeader(token);

    if (header.alg !== 'RS256') {
      return { valid: false, error: `Unsupported algorithm: ${header.alg}. Expected RS256.` };
    }

    if (!header.kid) {
      return { valid: false, error: 'Token header missing kid (Key ID)' };
    }

    // Fetch the signing key from JWKS
    let key: JwksKey;
    try {
      key = await options.jwksClient.getSigningKey(header.kid);
    } catch {
      return { valid: false, error: `Unable to find signing key for kid "${header.kid}"` };
    }

    // Verify the RS256 signature
    if (!verifyRS256Signature(token, key)) {
      return { valid: false, error: 'Invalid token signature' };
    }

    // Signature is valid — now validate claims
    return validateTokenClaims(token, {
      issuer: options.issuer,
      audience: options.audience,
      clockToleranceSeconds: options.clockToleranceSeconds,
    });
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Token verification failed' };
  }
}

export function extractRoles(payload: TokenPayload): string[] {
  if (!payload.role) return [];
  return Array.isArray(payload.role) ? payload.role : [payload.role];
}
