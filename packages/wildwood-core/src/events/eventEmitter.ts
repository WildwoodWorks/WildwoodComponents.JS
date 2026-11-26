// Typed event emitter for cross-service communication

import type { AuthenticationResponse } from '../auth/types.js';
import type { AttributionTouch } from '../attribution/types.js';

export interface WildwoodEvents {
  authChanged: AuthenticationResponse | null;
  sessionInitialized: boolean; // true if authenticated, false otherwise
  sessionExpired: void;
  tokenRefreshed: string;
  /**
   * The app requires two-factor authentication and the signed-in user has not set it up. Raised when
   * the session enters that state: from an auth response carrying `requiresTwoFactorEnrollment` (or a
   * restricted token), or from the API refusing a call with 403 TWO_FACTOR_ENROLLMENT_REQUIRED.
   * Route the user to two-factor enrollment, then call `session.completeTwoFactorEnrollment()`.
   */
  twoFactorEnrollmentRequired: { source: 'authResponse' | 'apiRefusal' };
  /** The restriction above was lifted: a refreshed token no longer carries it. */
  twoFactorEnrollmentCompleted: void;
  themeChanged: string;
  error: { service: string; message: string; details?: unknown };
  /** Campaign Attribution captured a campaign touch from the landing URL. */
  attributionCaptured: AttributionTouch;
  /**
   * What the user is entitled to just changed — they signed up, changed plan, bought or cancelled
   * a pack. Entitlements are cached behind several layers, so this is the signal to re-read the
   * subscription and the feature map rather than proof that the new state has propagated yet.
   */
  entitlementsChanged: {
    appId: string;
    reason: 'signup' | 'tierChange' | 'addOn' | 'cancel' | 'reactivate' | 'manual';
  };
}

type EventHandler<T> = T extends void ? () => void : (data: T) => void;

export class WildwoodEventEmitter {
  private listeners = new Map<string, Set<EventHandler<unknown>>>();

  on<K extends keyof WildwoodEvents>(event: K, handler: EventHandler<WildwoodEvents[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as EventHandler<unknown>);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(handler as EventHandler<unknown>);
    };
  }

  emit<K extends keyof WildwoodEvents>(
    event: K,
    ...args: WildwoodEvents[K] extends void ? [] : [WildwoodEvents[K]]
  ): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        (handler as (...a: unknown[]) => void)(...args);
      } catch (err) {
        console.error(`[Wildwood] Error in ${event} handler:`, err);
      }
    }
  }

  off<K extends keyof WildwoodEvents>(event: K, handler: EventHandler<WildwoodEvents[K]>): void {
    this.listeners.get(event)?.delete(handler as EventHandler<unknown>);
  }

  removeAllListeners(event?: keyof WildwoodEvents): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
