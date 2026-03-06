// JWT token utilities - manual base64 decode, no external dependencies
// Mirrors WildwoodComponents.Blazor/Services/WildwoodSessionManager.cs token parsing

export interface JwtPayload {
  sub?: string;
  email?: string;
  name?: string;
  role?: string | string[];
  company_id?: string;
  app_id?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  iss?: string;
  aud?: string;
  [key: string]: unknown;
}

/** Decode a JWT token payload without verification (client-side only) */
export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    // Handle base64url encoding
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

    const decoded = typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('utf-8');

    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}

/** Get the expiration time of a JWT token in milliseconds since epoch */
export function getTokenExpiry(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return null;
  return payload.exp * 1000;
}

/** Check if a JWT token is expired */
export function isTokenExpired(token: string, bufferMs = 0): boolean {
  const expiry = getTokenExpiry(token);
  if (expiry === null) return true;
  return Date.now() + bufferMs >= expiry;
}

/** Get remaining time until token expires in milliseconds */
export function getTokenRemainingMs(token: string): number {
  const expiry = getTokenExpiry(token);
  if (expiry === null) return 0;
  return Math.max(0, expiry - Date.now());
}

/** Calculate the refresh time (80% of token lifetime, matching Blazor behavior) */
export function getRefreshTimeMs(token: string): number {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp || !payload?.iat) {
    // Fallback: refresh 5 minutes before expiry
    const remaining = getTokenRemainingMs(token);
    return Math.max(0, remaining - 5 * 60 * 1000);
  }

  const lifetimeMs = (payload.exp - payload.iat) * 1000;
  const issuedAtMs = payload.iat * 1000;
  const refreshAtMs = issuedAtMs + lifetimeMs * 0.8;
  return Math.max(0, refreshAtMs - Date.now());
}

/** Extract user info from a JWT token */
export function extractUserFromToken(token: string): {
  userId?: string;
  email?: string;
  name?: string;
  roles: string[];
  companyId?: string;
  appId?: string;
} | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  const roles = Array.isArray(payload.role)
    ? payload.role
    : payload.role
      ? [payload.role]
      : [];

  return {
    userId: payload.sub,
    email: payload.email as string | undefined,
    name: payload.name as string | undefined,
    roles,
    companyId: payload.company_id as string | undefined,
    appId: payload.app_id as string | undefined,
  };
}
