import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useWildwood } from '@wildwood/react';

export interface DebugHttpEntry {
  id: string;
  method: string;
  url: string;
  status?: number;
  durationMs: number;
  timestamp: string;
}

export interface DebugLifecycleEntry {
  id: string;
  event: string;
  component: string;
  timestamp: string;
  data?: string;
}

export interface DebugSignalREntry {
  id: string;
  type: 'sent' | 'received' | 'state';
  message: string;
  timestamp: string;
}

export interface DebugContextValue {
  httpEntries: DebugHttpEntry[];
  lifecycleEntries: DebugLifecycleEntry[];
  signalREntries: DebugSignalREntry[];
  addLifecycleEntry: (event: string, component: string, data?: string) => void;
  addSignalREntry: (type: DebugSignalREntry['type'], message: string) => void;
  clearAll: () => void;
  clearHttp: () => void;
  clearLifecycle: () => void;
  clearSignalR: () => void;
}

const DebugCtx = createContext<DebugContextValue | null>(null);

let entryCounter = 0;
function nextId() {
  return `debug-${++entryCounter}`;
}

export function DebugProvider({ children }: { children: ReactNode }) {
  const client = useWildwood();
  const [httpEntries, setHttpEntries] = useState<DebugHttpEntry[]>([]);
  const [lifecycleEntries, setLifecycleEntries] = useState<DebugLifecycleEntry[]>([]);
  const [signalREntries, setSignalREntries] = useState<DebugSignalREntry[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Install HTTP interceptors on mount
  useEffect(() => {
    const removeReq = client.http.addRequestInterceptor((url, init) => {
      // Store the start time in a header that won't be sent
      return init;
    });

    const removeRes = client.http.addResponseInterceptor((url, response, durationMs) => {
      setHttpEntries((prev) => [
        {
          id: nextId(),
          method: 'HTTP',
          url,
          status: response.status,
          durationMs: Math.round(durationMs),
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 100)); // Keep last 100
    });

    cleanupRef.current = () => {
      removeReq();
      removeRes();
    };

    return () => cleanupRef.current?.();
  }, [client]);

  const addLifecycleEntry = useCallback((event: string, component: string, data?: string) => {
    setLifecycleEntries((prev) => [
      { id: nextId(), event, component, timestamp: new Date().toISOString(), data },
      ...prev,
    ].slice(0, 100));
  }, []);

  const addSignalREntry = useCallback((type: DebugSignalREntry['type'], message: string) => {
    setSignalREntries((prev) => [
      { id: nextId(), type, message, timestamp: new Date().toISOString() },
      ...prev,
    ].slice(0, 100));
  }, []);

  const clearAll = useCallback(() => {
    setHttpEntries([]);
    setLifecycleEntries([]);
    setSignalREntries([]);
  }, []);

  const clearHttp = useCallback(() => setHttpEntries([]), []);
  const clearLifecycle = useCallback(() => setLifecycleEntries([]), []);
  const clearSignalR = useCallback(() => setSignalREntries([]), []);

  return (
    <DebugCtx.Provider value={{
      httpEntries, lifecycleEntries, signalREntries,
      addLifecycleEntry, addSignalREntry,
      clearAll, clearHttp, clearLifecycle, clearSignalR,
    }}>
      {children}
    </DebugCtx.Provider>
  );
}

export function useDebug(): DebugContextValue {
  const ctx = useContext(DebugCtx);
  if (!ctx) throw new Error('useDebug must be used within a DebugProvider');
  return ctx;
}
