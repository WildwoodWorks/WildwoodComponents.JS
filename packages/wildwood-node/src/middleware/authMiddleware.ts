import type { Request, Response, NextFunction } from 'express';
import { decodeToken, isTokenExpired, extractRoles } from '../utils/tokenValidator.js';
import type { TokenValidationOptions } from '../utils/tokenValidator.js';

export interface AuthMiddlewareOptions {
  baseUrl: string;
  apiKey?: string;
  tokenHeader?: string;
  userProperty?: string;
  excludePaths?: string[];
  onError?: (error: Error, req: Request, res: Response) => void;
  /** Optional issuer/audience/clock tolerance for local JWT validation */
  tokenValidation?: TokenValidationOptions;
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
    apiKey,
    tokenHeader = 'authorization',
    userProperty = 'wildwoodUser',
    excludePaths = [],
    onError,
    tokenValidation,
  } = options;

  // Normalize baseUrl to remove trailing slash
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

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
      // Decode and validate JWT locally
      const payload = decodeToken(token);

      // Check expiration
      const tolerance = tokenValidation?.clockToleranceSeconds ?? 0;
      if (isTokenExpired(token, tolerance)) {
        if (onError) {
          return onError(new Error('Token has expired'), req, res);
        }
        return res.status(401).json({ error: 'Token has expired' });
      }

      // Validate issuer/audience if configured
      if (tokenValidation?.issuer && payload.iss !== tokenValidation.issuer) {
        if (onError) {
          return onError(new Error(`Invalid issuer: ${payload.iss}`), req, res);
        }
        return res.status(401).json({ error: 'Invalid token issuer' });
      }

      if (tokenValidation?.audience && payload.aud !== tokenValidation.audience) {
        if (onError) {
          return onError(new Error(`Invalid audience: ${payload.aud}`), req, res);
        }
        return res.status(401).json({ error: 'Invalid token audience' });
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
