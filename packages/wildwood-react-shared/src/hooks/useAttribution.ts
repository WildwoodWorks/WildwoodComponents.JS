'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AttributionPayload, AttributionState, AttributionTouch, FunnelTrackOptions } from '@wildwood/core';
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
  /**
   * Tracks a funnel event (a standard client event or one of the app's custom names). Dropped when the
   * app has funnel tracking off or the name is not allowed. Never throws.
   */
  track: (name: string, options?: FunnelTrackOptions) => void;
  /** Tracks a cta_click with this label, for CTAs the `data-ww-cta` attribute cannot mark (native, canvas). */
  trackCta: (label: string) => void;
  /** Sends the queued funnel events now (before a hard navigation or when the app is backgrounded). */
  flush: () => Promise<void>;
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
  const track = useCallback(
    (name: string, options?: FunnelTrackOptions) => client.attribution.track(name, options),
    [client],
  );
  const trackCta = useCallback((label: string) => client.attribution.trackCta(label), [client]);
  const flush = useCallback(() => client.attribution.flush(), [client]);

  return {
    state,
    touch: state.last,
    isPersisted: state.persisted,
    captureUrl,
    getForRegistration,
    clear,
    track,
    trackCta,
    flush,
  };
}
