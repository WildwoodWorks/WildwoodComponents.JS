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
    get state() { return state; },

    async connect() {
      if (state === 'connected' || state === 'connecting') return;

      const signalR = await getSignalR();
      if (!signalR) return;

      setState('connecting');
      try {
        let builder = new signalR.HubConnectionBuilder()
          .withUrl(config.hubUrl, {
            accessTokenFactory: config.getAccessToken
              ? () => config.getAccessToken!().then((t) => t ?? '')
              : undefined,
          });

        if (config.autoReconnect !== false) {
          builder = builder.withAutomaticReconnect(config.reconnectDelays ?? [0, 2000, 5000, 10000, 30000]);
        }

        const connection = builder.build();

        connection.onreconnecting(() => setState('reconnecting'));
        connection.onreconnected(() => setState('connected'));
        connection.onclose(() => setState('disconnected'));

        // Re-register all event handlers on the connection
        eventHandlers.forEach((handlers, eventName) => {
          handlers.forEach((handler) => {
            connection.on(eventName, handler);
          });
        });

        await connection.start();
        hubConnection = connection;
        setState('connected');
      } catch (err) {
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
