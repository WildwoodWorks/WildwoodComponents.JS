import type { Request, Response, NextFunction } from 'express';

export interface AuthMiddlewareOptions {
  baseUrl: string;
  apiKey?: string;
  tokenHeader?: string;
  userProperty?: string;
  excludePaths?: string[];
  onError?: (error: Error, req: Request, res: Response) => void;
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
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Check excluded paths
    if (excludePaths.some((path) => req.path.startsWith(path))) {
      return next();
    }

    const authHeader = req.headers[tokenHeader.toLowerCase()];
    if (!authHeader || typeof authHeader !== 'string') {
      if (onError) {
        return onError(new Error('No authorization header'), req, res);
      }
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    try {
      const validateUrl = `${baseUrl}/api/auth/validate`;
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['X-API-Key'] = apiKey;
      }

      const response = await fetch(validateUrl, { method: 'GET', headers });

      if (!response.ok) {
        if (onError) {
          return onError(new Error(`Token validation failed: ${response.status}`), req, res);
        }
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      const userData = await response.json() as WildwoodUser;
      (req as unknown as Record<string, unknown>)[userProperty] = userData;
      req.wildwoodToken = token;
      next();
    } catch (error) {
      if (onError) {
        return onError(error instanceof Error ? error : new Error(String(error)), req, res);
      }
      return res.status(500).json({ error: 'Token validation failed' });
    }
  };
}
