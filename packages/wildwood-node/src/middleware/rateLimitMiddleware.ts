import type { Request, Response, NextFunction } from 'express';

export interface RateLimitOptions {
  /** Max requests per window (default: 100) */
  maxRequests?: number;
  /** Time window in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number;
  /** Key extractor - determines how to identify clients (default: IP address) */
  keyExtractor?: (req: Request) => string;
  /** Custom handler when rate limit is exceeded */
  onLimitReached?: (req: Request, res: Response) => void;
  /** Paths to exclude from rate limiting */
  excludePaths?: string[];
  /** Custom message when rate limited (default: 'Too many requests') */
  message?: string;
  /** Whether to include rate limit headers in response (default: true) */
  includeHeaders?: boolean;
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

export function createRateLimitMiddleware(options: RateLimitOptions = {}) {
  const {
    maxRequests = 100,
    windowMs = 60_000,
    keyExtractor = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'unknown',
    onLimitReached,
    excludePaths = [],
    message = 'Too many requests, please try again later',
    includeHeaders = true,
  } = options;

  const clients = new Map<string, ClientRecord>();

  // Periodically clean up expired entries to prevent memory leaks
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of clients) {
      if (now >= record.resetTime) {
        clients.delete(key);
      }
    }
  }, windowMs);

  // Allow garbage collection if the process is shutting down
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    if (excludePaths.some((path) => req.path.startsWith(path))) {
      return next();
    }

    const key = keyExtractor(req);
    const now = Date.now();

    let record = clients.get(key);
    if (!record || now >= record.resetTime) {
      record = { count: 0, resetTime: now + windowMs };
      clients.set(key, record);
    }

    record.count++;

    if (includeHeaders) {
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
      res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
    }

    if (record.count > maxRequests) {
      if (includeHeaders) {
        res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000));
      }

      if (onLimitReached) {
        return onLimitReached(req, res);
      }

      return res.status(429).json({ error: message });
    }

    next();
  };
}
