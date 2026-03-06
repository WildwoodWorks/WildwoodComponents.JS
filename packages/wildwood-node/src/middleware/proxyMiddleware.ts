import type { Request, Response, NextFunction } from 'express';

export interface ProxyMiddlewareOptions {
  baseUrl: string;
  apiKey: string;
  pathPrefix?: string;
  timeout?: number;
  onError?: (error: Error, req: Request, res: Response) => void;
}

export function createProxyMiddleware(options: ProxyMiddlewareOptions) {
  const {
    baseUrl,
    apiKey,
    pathPrefix = '/api',
    timeout = 30000,
    onError,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith(pathPrefix)) {
      return next();
    }

    const queryString = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    const targetUrl = `${baseUrl}${req.path}${queryString}`;
    const headers: Record<string, string> = {
      'X-API-Key': apiKey,
      'Content-Type': req.headers['content-type'] || 'application/json',
    };

    // Forward auth token if present
    if (req.wildwoodToken) {
      headers['Authorization'] = `Bearer ${req.wildwoodToken}`;
    }

    // Forward relevant headers
    const forwardHeaders = ['x-app-id', 'x-company-id', 'accept', 'accept-language'];
    for (const header of forwardHeaders) {
      const value = req.headers[header];
      if (typeof value === 'string') {
        headers[header] = value;
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
        signal: controller.signal,
      };

      if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, fetchOptions);
      clearTimeout(timeoutId);

      // Forward status and headers
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

      return res.status(502).json({ error: 'Proxy request failed' });
    }
  };
}
