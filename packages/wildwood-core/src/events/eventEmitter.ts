// Typed event emitter for cross-service communication

import type { AuthenticationResponse } from '../auth/types.js';

export interface WildwoodEvents {
  authChanged: AuthenticationResponse | null;
  sessionInitialized: boolean; // true if authenticated, false otherwise
  sessionExpired: void;
  tokenRefreshed: string;
  themeChanged: string;
  error: { service: string; message: string; details?: unknown };
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
