// Feedback proxy middleware for Express.
//
// Lets an Express/SSR backend host the browser feedback widget without exposing
// the Wildwood API key (or a user's bearer token) to the client. The widget in
// the browser calls these mount-relative routes; this middleware forwards them
// to the WildwoodAPI SystemFeedback + AppComponentConfigurations endpoints,
// attaching credentials server-side.
//
// Mirrors `createProxyMiddleware` (factory signature, server-side X-API-Key
// injection, AbortController timeout, JSON/text passthrough, onError contract).
// Where the generic proxy forwards any path 1:1, this one maps a small, fixed
// set of feedback routes and is meant to be mounted on its own path:
//
//   app.use('/feedback', createFeedbackProxyMiddleware({ baseUrl, apiKey }));
//
//   POST {mount}/submit          -> POST api/SystemFeedback
//   GET  {mount}/duplicate-check -> GET  api/SystemFeedback/duplicate-check
//   POST {mount}/:id/vote        -> POST api/SystemFeedback/{id}/vote
//   GET  {mount}/widget?appId=   -> GET  api/AppComponentConfigurations/{appId}/feedback/widget
//   GET  {mount}/:appId/widget   -> GET  api/AppComponentConfigurations/{appId}/feedback/widget

import type { Request, Response, NextFunction } from 'express';

export interface FeedbackProxyMiddlewareOptions {
  /** Wildwood API base URL (e.g. https://api.wildwoodworks.io). */
  baseUrl: string;
  /** Server-side API key, attached as X-API-Key. Never sent to the browser. */
  apiKey: string;
  /** Upstream request timeout in ms (default 30000). */
  timeout?: number;
  /**
   * Resolve a bearer token to attach server-side (e.g. from an SSR session).
   * The browser never sees this token. If omitted, `req.wildwoodToken`
   * (populated by `createAuthMiddleware`) is used when present; otherwise the
   * request is forwarded anonymously, which the API allows for apps that permit
   * anonymous feedback.
   */
  getToken?: (req: Request) => string | undefined | Promise<string | undefined>;
  /** Custom error handler. Defaults to 504 on timeout, 502 otherwise. */
  onError?: (error: Error, req: Request, res: Response) => void;
}

interface FeedbackRoute {
  method: 'GET' | 'POST';
  /** Upstream path + query relative to baseUrl, e.g. "api/SystemFeedback". */
  targetPath: string;
}

/**
 * Map a mount-relative request to its upstream feedback route.
 * Returns null when the path/method is not a recognized feedback route so the
 * middleware can fall through to the next handler.
 */
function resolveRoute(req: Request): FeedbackRoute | null {
  // Normalize: strip leading slash and any trailing slash, drop the query.
  const rawPath = req.path.replace(/^\/+/, '').replace(/\/+$/, '');
  const method = req.method.toUpperCase();

  if (method === 'POST' && rawPath === 'submit') {
    return { method: 'POST', targetPath: 'api/SystemFeedback' };
  }

  if (method === 'GET' && rawPath === 'duplicate-check') {
    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    return { method: 'GET', targetPath: `api/SystemFeedback/duplicate-check${query}` };
  }

  // POST {id}/vote
  const voteMatch = method === 'POST' ? /^([^/]+)\/vote$/.exec(rawPath) : null;
  if (voteMatch) {
    // Express leaves req.path percent-encoded, so the captured segment is
    // already in wire form; the `[^/]+` capture guarantees no literal path
    // separator. Forward it as-is. (Re-decoding here would throw URIError on a
    // malformed percent sequence and double-decode legitimate content; any
    // encoded %2F stays a literal to the API, so path traversal can't occur.)
    const id = voteMatch[1];
    return { method: 'POST', targetPath: `api/SystemFeedback/${id}/vote` };
  }

  // GET widget?appId=  OR  GET {appId}/widget
  if (method === 'GET') {
    if (rawPath === 'widget') {
      const appId = typeof req.query.appId === 'string' ? req.query.appId : '';
      return {
        method: 'GET',
        targetPath: `api/AppComponentConfigurations/${encodeURIComponent(appId)}/feedback/widget`,
      };
    }
    const widgetMatch = /^([^/]+)\/widget$/.exec(rawPath);
    if (widgetMatch) {
      // Already-encoded path segment from req.path with no literal separator
      // (see the vote route above); forward as-is to avoid a double-decode.
      const appId = widgetMatch[1];
      return { method: 'GET', targetPath: `api/AppComponentConfigurations/${appId}/feedback/widget` };
    }
  }

  return null;
}

export function createFeedbackProxyMiddleware(options: FeedbackProxyMiddlewareOptions) {
  const { baseUrl, apiKey, timeout = 30000, getToken, onError } = options;

  // Normalize baseUrl to remove trailing slash so we can join "api/..." cleanly.
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  return async (req: Request, res: Response, next: NextFunction) => {
    const route = resolveRoute(req);
    if (!route) {
      return next();
    }

    const targetUrl = `${normalizedBaseUrl}/${route.targetPath}`;
    const headers: Record<string, string> = {
      'X-API-Key': apiKey,
      'Content-Type': req.headers['content-type'] || 'application/json',
    };

    try {
      // Attach a bearer token server-side. Prefer an explicit resolver; fall
      // back to a token already validated/attached by the auth middleware.
      const token = (await getToken?.(req)) ?? req.wildwoodToken;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Forward a few client hints the API uses for context/tenancy.
      const forwardHeaders = ['x-app-id', 'x-company-id', 'accept', 'accept-language'];
      for (const header of forwardHeaders) {
        const value = req.headers[header];
        if (typeof value === 'string') {
          headers[header] = value;
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const fetchOptions: RequestInit = {
        method: route.method,
        headers,
        signal: controller.signal,
      };

      // Only POST routes carry a body (submit). Vote has no body.
      if (route.method === 'POST' && req.body !== undefined && req.body !== null) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, fetchOptions);
      clearTimeout(timeoutId);

      // Forward status + content type, passing JSON/text straight through.
      res.status(response.status);
      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }

      if (contentType?.includes('application/json')) {
        const data = await response.json();
        res.json(data);
      } else {
        const text = await response.text();
        res.send(text);
      }
    } catch (error) {
      if (onError) {
        return onError(error instanceof Error ? error : new Error(String(error)), req, res);
      }

      if (error instanceof Error && error.name === 'AbortError') {
        return res.status(504).json({ error: 'Upstream request timed out' });
      }

      return res.status(502).json({ error: 'Feedback proxy request failed' });
    }
  };
}
