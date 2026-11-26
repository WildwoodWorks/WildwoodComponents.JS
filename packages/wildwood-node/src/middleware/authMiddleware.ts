import type { Request, Response, NextFunction } from 'express';
import { validateTokenClaims, verifyToken, extractRoles } from '../utils/tokenValidator.js';
import type { TokenValidationOptions } from '../utils/tokenValidator.js';
import { createJwksClient } from '../utils/jwksClient.js';
import type { JwksClient } from '../utils/jwksClient.js';

export interface AuthMiddlewareOptions {
  /**
   * Wildwood API base URL (e.g. https://api.wildwoodworks.io).
   * Used to auto-create a JWKS client for RS256 token verification when `jwksClient` is not provided.
   */
  baseUrl: string;
  apiKey?: string;
  tokenHeader?: string;
  userProperty?: string;
  excludePaths?: string[];
  onError?: (error: Error, req: Request, res: Response) => void;
  /** Optional issuer/audience/clock tolerance for JWT claim validation */
  tokenValidation?: TokenValidationOptions;
  /**
   * JWKS client for RS256 signature verification.
   * If omitted, one is auto-created from `baseUrl`.
   * Set to `false` to disable signature verification entirely (decode-only mode).
   */
  jwksClient?: JwksClient | false;
  /**
   * Accept tokens restricted to two-factor enrollment (claim `tfa_enroll_pending`). The Wildwood API
   * issues one when the app requires two-factor and the user has not set it up yet, and refuses every
   * call but enrollment with it. By default this middleware refuses it the same way (403,
   * errorCode TWO_FACTOR_ENROLLMENT_REQUIRED), so your backend cannot become the way around that
   * policy. Set true only for routes that help the user enroll; the user object then carries
   * `twoFactorEnrollmentPending: true`.
   */
  allowTwoFactorEnrollmentPending?: boolean;
}

/** JWT claim marking a token restricted to two-factor enrollment. */
export const TWO_FACTOR_ENROLLMENT_PENDING_CLAIM = 'tfa_enroll_pending';
/** errorCode the API (and this middleware) answers with when refusing such a token. */
export const TWO_FACTOR_ENROLLMENT_REQUIRED = 'TWO_FACTOR_ENROLLMENT_REQUIRED';

export interface WildwoodUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  appId: string;
  companyId: string;
  roles: string[];
  claims: Record<string, string>;
  /** The token is restricted to two-factor enrollment (only reachable with allowTwoFactorEnrollmentPending). */
  twoFactorEnrollmentPending: boolean;
}

declare global {
  namespace Express {
    interface Request {
      wildwoodUser?: WildwoodUser;
      wildwoodToken?: string;
    }
  }
}

export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const {
    baseUrl,
    tokenHeader = 'authorization',
    userProperty = 'wildwoodUser',
    excludePaths = [],
    onError,
    tokenValidation,
    allowTwoFactorEnrollmentPending = false,
  } = options;

  // Auto-create JWKS client from baseUrl unless explicitly disabled
  const jwksClient = options.jwksClient === false ? null : (options.jwksClient ?? createJwksClient(baseUrl));

  return async (req: Request, res: Response, next: NextFunction) => {
    // Check excluded paths
    if (excludePaths.some((path) => req.path.startsWith(path))) {
      return next();
    }

    let authHeader = req.headers[tokenHeader.toLowerCase()];
    if (Array.isArray(authHeader)) {
      authHeader = authHeader[0];
    }
    if (!authHeader || typeof authHeader !== 'string') {
      if (onError) {
        return onError(new Error('No authorization header'), req, res);
      }
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    try {
      let payload;

      if (jwksClient) {
        // Full RS256 signature verification via JWKS
        const result = await verifyToken(token, {
          jwksClient,
          issuer: tokenValidation?.issuer,
          audience: tokenValidation?.audience,
          clockToleranceSeconds: tokenValidation?.clockToleranceSeconds,
        });

        if (!result.valid || !result.payload) {
          const error = new Error(result.error ?? 'Token verification failed');
          if (onError) {
            return onError(error, req, res);
          }
          return res.status(401).json({ error: result.error ?? 'Invalid token' });
        }

        payload = result.payload;
      } else {
        // Decode-only mode (no signature verification)
        const result = validateTokenClaims(token, tokenValidation);
        if (!result.valid || !result.payload) {
          const error = new Error(result.error ?? 'Token validation failed');
          if (onError) {
            return onError(error, req, res);
          }
          return res.status(401).json({ error: result.error ?? 'Invalid token' });
        }

        payload = result.payload;
      }

      // Build user object from JWT claims
      const claims: Record<string, string> = {};
      for (const [key, value] of Object.entries(payload)) {
        if (typeof value === 'string') {
          claims[key] = value;
        }
      }

      const twoFactorEnrollmentPending =
        payload[TWO_FACTOR_ENROLLMENT_PENDING_CLAIM] === 'true' ||
        payload[TWO_FACTOR_ENROLLMENT_PENDING_CLAIM] === true;
      if (twoFactorEnrollmentPending && !allowTwoFactorEnrollmentPending) {
        const message = 'Two-factor authentication must be set up before continuing.';
        if (onError) {
          return onError(new Error(message), req, res);
        }
        return res.status(403).json({ error: message, errorCode: TWO_FACTOR_ENROLLMENT_REQUIRED });
      }

      const user: WildwoodUser = {
        userId: payload.sub,
        email: payload.email ?? '',
        firstName: (payload.given_name as string) ?? '',
        lastName: (payload.family_name as string) ?? '',
        appId: (payload.app_id as string) ?? '',
        companyId: (payload.company_id as string) ?? '',
        roles: extractRoles(payload),
        claims,
        twoFactorEnrollmentPending,
      };

      (req as unknown as Record<string, unknown>)[userProperty] = user;
      req.wildwoodToken = token;
      next();
    } catch (error) {
      if (onError) {
        return onError(error instanceof Error ? error : new Error(String(error)), req, res);
      }
      return res.status(401).json({ error: 'Invalid or malformed token' });
    }
  };
}
