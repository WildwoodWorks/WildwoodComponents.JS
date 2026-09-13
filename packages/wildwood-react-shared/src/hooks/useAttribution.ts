'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AttributionPayload, AttributionState, AttributionTouch } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseAttributionReturn {
  /** Visitor key, first and last touch, whether they are persisted, and the app's attribution config. */
  state: AttributionState;
  /** The most recent campaign touch (the last touch), or null. */
  touch: AttributionTouch | null;
  /** True while the touches are held in storage (the app's consent category allowed it). */
  isPersisted: boolean;
  /** Parses a URL (a deep link, an SPA navigation) and applies it as a touch. Null for a direct visit. */
  captureUrl: (url: string, referrer?: string | null) => AttributionTouch | null;
  /** The payload registration requests carry, or null when nothing was captured. */
  getForRegistration: () => AttributionPayload | null;
  /** Drops the captured touches from memory and storage. */
  clear: () => void;
}

/**
 * Campaign Attribution hook. WildwoodProvider starts capture on mount; this hook reads the state and
 * re-renders when it changes (a captured touch, a consent decision that persists it, a clear).
 * Registration components attach the payload on their own, so most apps never need this hook.
 */
export function useAttribution(): UseAttributionReturn {
  const client = useWildwood();
  const [state, setState] = useState<AttributionState>(() => client.attribution.getState());

  useEffect(() => {
    // The state may have changed between the first render and this subscription.
    setState(client.attribution.getState());
    return client.attribution.onChange(setState);
  }, [client]);

  const captureUrl = useCallback(
    (url: string, referrer?: string | null) => client.attribution.captureUrl(url, referrer),
    [client],
  );
  const getForRegistration = useCallback(() => client.attribution.getForRegistration(), [client]);
  const clear = useCallback(() => client.attribution.clear(), [client]);

  return {
    state,
    touch: state.last,
    isPersisted: state.persisted,
    captureUrl,
    getForRegistration,
    clear,
  };
}
