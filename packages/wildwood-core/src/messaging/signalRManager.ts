// SignalR connection manager for real-time messaging
// Manages @microsoft/signalr connection lifecycle

export interface SignalRManagerConfig {
  hubUrl: string;
  getAccessToken?: () => Promise<string | null>;
  autoReconnect?: boolean;
  reconnectDelays?: number[];
}

export type SignalRConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface SignalRManager {
  readonly state: SignalRConnectionState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  on(eventName: string, handler: (...args: unknown[]) => void): void;
  off(eventName: string, handler: (...args: unknown[]) => void): void;
  invoke(methodName: string, ...args: unknown[]): Promise<unknown>;
  onStateChange(handler: (state: SignalRConnectionState) => void): () => void;
}

/**
 * Create a SignalR manager instance.
 * Requires @microsoft/signalr as a peer dependency.
 * Falls back to a no-op stub if SignalR is not available.
 */
export function createSignalRManager(config: SignalRManagerConfig): SignalRManager {
  let state: SignalRConnectionState = 'disconnected';
  const stateHandlers = new Set<(state: SignalRConnectionState) => void>();
  const eventHandlers = new Map<string, Set<(...args: unknown[]) => void>>();
  let hubConnection: unknown = null;

  function setState(newState: SignalRConnectionState) {
    state = newState;
    stateHandlers.forEach((h) => h(state));
  }

  async function getSignalR() {
    try {
      // Dynamic import - @microsoft/signalr is an optional peer dependency
      const signalR = await import('@microsoft/signalr');
      return signalR;
    } catch {
      console.warn('[Wildwood] @microsoft/signalr not installed. Real-time messaging unavailable.');
      return null;
    }
  }

  return {
    get state() {
      return state;
    },

    async connect() {
      if (state === 'connected' || state === 'connecting') return;

      // Set state immediately to prevent concurrent connect() calls
      // (getSignalR() is async, creating a gap without this)
      setState('connecting');

      const signalR = await getSignalR();
      if (!signalR) {
        setState('disconnected');
        return;
      }
      const connectTimeout = setTimeout(() => {
        if (state === 'connecting') {
          setState('disconnected');
          console.error('[Wildwood] SignalR connection timed out after 30s');
        }
      }, 30_000);
      try {
        let builder = new signalR.HubConnectionBuilder().withUrl(config.hubUrl, {
          accessTokenFactory: config.getAccessToken ? () => config.getAccessToken!().then((t) => t ?? '') : undefined,
        });

        if (config.autoReconnect !== false) {
          builder = builder.withAutomaticReconnect(config.reconnectDelays ?? [0, 2000, 5000, 10000, 30000]);
        }

        const connection = builder.build();

        connection.onreconnecting(() => setState('reconnecting'));
        connection.onreconnected(() => setState('connected'));
        connection.onclose(() => setState('disconnected'));

        // Clean up handlers on old connection before switching
        if (hubConnection) {
          const oldConn = hubConnection as { off(e: string, h: (...args: unknown[]) => void): void };
          eventHandlers.forEach((handlers, eventName) => {
            handlers.forEach((handler) => {
              oldConn.off(eventName, handler);
            });
          });
        }

        // Register all event handlers on the new connection
        eventHandlers.forEach((handlers, eventName) => {
          handlers.forEach((handler) => {
            connection.on(eventName, handler);
          });
        });

        await connection.start();
        hubConnection = connection;
        clearTimeout(connectTimeout);
        setState('connected');
      } catch (err) {
        clearTimeout(connectTimeout);
        setState('disconnected');
        console.error('[Wildwood] SignalR connection failed:', err);
      }
    },

    async disconnect() {
      if (!hubConnection || state === 'disconnected') return;
      try {
        await (hubConnection as { stop(): Promise<void> }).stop();
      } catch {
        // Ignore disconnect errors
      }
      hubConnection = null;
      setState('disconnected');
    },

    on(eventName: string, handler: (...args: unknown[]) => void) {
      if (!eventHandlers.has(eventName)) {
        eventHandlers.set(eventName, new Set());
      }
      eventHandlers.get(eventName)!.add(handler);

      if (hubConnection) {
        (hubConnection as { on(e: string, h: (...args: unknown[]) => void): void }).on(eventName, handler);
      }
    },

    off(eventName: string, handler: (...args: unknown[]) => void) {
      eventHandlers.get(eventName)?.delete(handler);

      if (hubConnection) {
        (hubConnection as { off(e: string, h: (...args: unknown[]) => void): void }).off(eventName, handler);
      }
    },

    async invoke(methodName: string, ...args: unknown[]) {
      if (!hubConnection || state !== 'connected') {
        throw new Error('SignalR not connected');
      }
      return (hubConnection as { invoke(m: string, ...a: unknown[]): Promise<unknown> }).invoke(methodName, ...args);
    },

    onStateChange(handler: (state: SignalRConnectionState) => void) {
      stateHandlers.add(handler);
      return () => stateHandlers.delete(handler);
    },
  };
}
