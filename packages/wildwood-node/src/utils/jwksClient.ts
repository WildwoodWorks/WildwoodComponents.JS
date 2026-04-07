import { createPublicKey, verify } from 'node:crypto';

export interface JwksKey {
  kty: string;
  use?: string;
  kid: string;
  alg?: string;
  n: string;
  e: string;
}

export interface JwksResponse {
  keys: JwksKey[];
}

export interface JwksClientOptions {
  /** JWKS endpoint URL (e.g. https://api.wildwoodworks.io/.well-known/jwks.json) */
  jwksUri: string;
  /** Cache duration in milliseconds (default: 1 hour) */
  cacheDurationMs?: number;
  /** Request timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
}

interface CachedKeys {
  keys: JwksKey[];
  fetchedAt: number;
}

/**
 * JWKS client that fetches and caches public keys from a Wildwood API JWKS endpoint.
 * Uses Node.js built-in crypto — no external dependencies.
 */
export class JwksClient {
  private readonly jwksUri: string;
  private readonly cacheDurationMs: number;
  private readonly timeoutMs: number;
  private cache: CachedKeys | null = null;
  private pendingFetch: Promise<JwksKey[]> | null = null;

  constructor(options: JwksClientOptions) {
    this.jwksUri = options.jwksUri;
    this.cacheDurationMs = options.cacheDurationMs ?? 3_600_000; // 1 hour
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  /**
   * Get all signing keys from the JWKS endpoint (cached).
   */
  async getSigningKeys(): Promise<JwksKey[]> {
    if (this.cache && Date.now() - this.cache.fetchedAt < this.cacheDurationMs) {
      return this.cache.keys;
    }

    // Deduplicate concurrent fetches
    if (this.pendingFetch) {
      return this.pendingFetch;
    }

    this.pendingFetch = this.fetchKeys();
    try {
      const keys = await this.pendingFetch;
      return keys;
    } finally {
      this.pendingFetch = null;
    }
  }

  /**
   * Get the signing key matching a specific kid (Key ID).
   * If not found in cache, forces a refresh in case keys rotated.
   */
  async getSigningKey(kid: string): Promise<JwksKey> {
    let keys = await this.getSigningKeys();
    let key = keys.find((k) => k.kid === kid);

    if (!key) {
      // Key not found — could be a key rotation. Force refresh once.
      this.cache = null;
      keys = await this.getSigningKeys();
      key = keys.find((k) => k.kid === kid);
    }

    if (!key) {
      throw new Error(`No signing key found for kid "${kid}"`);
    }

    return key;
  }

  /** Clear the cached keys */
  clearCache(): void {
    this.cache = null;
  }

  private async fetchKeys(): Promise<JwksKey[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.jwksUri, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`JWKS fetch failed: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as JwksResponse;

      if (!data.keys || !Array.isArray(data.keys)) {
        throw new Error('Invalid JWKS response: missing keys array');
      }

      // Filter to RSA signing keys only
      const signingKeys = data.keys.filter((k) => k.kty === 'RSA' && (!k.use || k.use === 'sig'));

      this.cache = { keys: signingKeys, fetchedAt: Date.now() };
      return signingKeys;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * Convert a JWK RSA key to a Node.js crypto public key and verify a JWT signature.
 */
export function verifyRS256Signature(token: string, jwk: JwksKey): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const signatureInput = `${headerB64}.${payloadB64}`;

  // Build JWK object for Node.js crypto
  const publicKey = createPublicKey({
    key: {
      kty: 'RSA',
      n: jwk.n,
      e: jwk.e,
    },
    format: 'jwk',
  });

  // Convert base64url signature to buffer
  const signature = Buffer.from(signatureB64, 'base64url');

  return verify('RSA-SHA256', Buffer.from(signatureInput), publicKey, signature);
}

/**
 * Create a JwksClient from a Wildwood API base URL.
 * Automatically constructs the JWKS URI from the base URL.
 */
export function createJwksClient(baseUrl: string, options?: Omit<JwksClientOptions, 'jwksUri'>): JwksClient {
  const normalizedUrl = baseUrl.replace(/\/+$/, '');
  return new JwksClient({
    jwksUri: `${normalizedUrl}/.well-known/jwks.json`,
    ...options,
  });
}
