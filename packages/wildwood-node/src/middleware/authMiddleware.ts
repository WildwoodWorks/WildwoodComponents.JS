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
}

export interface WildwoodUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  appId: string;
  companyId: string;
  roles: string[];
  claims: Record<string, string>;
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

      const user: WildwoodUser = {
        userId: payload.sub,
        email: payload.email ?? '',
        firstName: (payload.given_name as string) ?? '',
        lastName: (payload.family_name as string) ?? '',
        appId: (payload.app_id as string) ?? '',
        companyId: (payload.company_id as string) ?? '',
        roles: extractRoles(payload),
        claims,
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
