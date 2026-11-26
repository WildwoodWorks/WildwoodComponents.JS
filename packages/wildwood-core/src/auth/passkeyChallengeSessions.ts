/**
 * The API accepts a passkey assertion only against the challenge it issued, identified by the options'
 * `sessionId`. This remembers each issued challenge's session and finds it again from the challenge inside
 * the assertion's signed clientDataJSON, so concurrent sign-ins through one client (for example a shared
 * server-side client) never pick up each other's session, which would also burn the other challenge.
 */
const CAPACITY = 32;
const LIFETIME_MS = 5 * 60 * 1000;

// Base64url without padding, so the options' and the client data's spellings compare equal.
function normalize(challenge: unknown): string | null {
  if (typeof challenge !== 'string' || challenge.length === 0) return null;
  return challenge.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function challengeOf(clientDataJSON: unknown): string | null {
  if (typeof clientDataJSON !== 'string' || clientDataJSON.length === 0) return null;
  try {
    const base64 = clientDataJSON.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf-8');
    return normalize((JSON.parse(decoded) as { challenge?: unknown }).challenge);
  } catch {
    return null;
  }
}

export class PasskeyChallengeSessions {
  private readonly byChallenge = new Map<string, { sessionId: string; issuedAt: number }>();
  private last: string | null = null;

  constructor(private readonly now: () => number = () => Date.now()) {}

  remember(options: unknown): void {
    const o = options as { sessionId?: unknown; challenge?: unknown } | null;
    const sessionId = typeof o?.sessionId === 'string' && o.sessionId ? o.sessionId : null;
    if (!sessionId) return;
    this.last = sessionId;
    const challenge = normalize(o?.challenge);
    if (!challenge) return;

    const now = this.now();
    for (const [key, entry] of this.byChallenge) {
      if (now - entry.issuedAt > LIFETIME_MS) this.byChallenge.delete(key);
    }
    while (this.byChallenge.size >= CAPACITY) {
      // Map iteration order is insertion order: the first key is the oldest.
      const oldest = this.byChallenge.keys().next().value as string;
      this.byChallenge.delete(oldest);
    }
    this.byChallenge.set(challenge, { sessionId, issuedAt: now });
  }

  /** The session for the assertion's challenge; the most recent one when the client data cannot be read. */
  take(clientDataJSON: unknown): string | null {
    const challenge = challengeOf(clientDataJSON);
    const entry = challenge ? this.byChallenge.get(challenge) : undefined;
    if (challenge && entry) {
      this.byChallenge.delete(challenge);
      if (this.last === entry.sessionId) this.last = null;
      return entry.sessionId;
    }
    const fallback = this.last;
    this.last = null;
    return fallback;
  }
}
