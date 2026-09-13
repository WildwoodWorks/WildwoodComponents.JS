'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { createWildwoodClient, type WildwoodConfig } from '@wildwood/core';
import { WildwoodContext } from './WildwoodContext.js';

/**
 * Layout effects run before every passive effect in the tree, while a child's passive effect runs before
 * its parent's. Campaign attribution therefore starts in a layout effect, so it reads the landing URL before
 * a child's useEffect can redirect or strip the query string. On the server (prerendering) layout effects
 * never run and React would warn, so useEffect stands in there.
 */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface WildwoodProviderProps {
  config: WildwoodConfig;
  children: ReactNode;
}

export function WildwoodProvider({ config, children }: WildwoodProviderProps) {
  const configRef = useRef(config);
  const client = useMemo(() => createWildwoodClient(configRef.current), []);

  useIsomorphicLayoutEffect(() => {
    // Never rejects; a failure only means no campaign attribution for this page load. Idempotent, and a
    // re-run after client.dispose() (StrictMode) re-arms its consent subscription.
    client.attribution.initialize().catch(() => {});
  }, [client]);

  useEffect(() => {
    // Initialize session from storage on mount
    client.session.initialize();
    // Initialize theme
    client.theme.initialize();

    return () => {
      client.dispose();
    };
  }, [client]);

  return <WildwoodContext.Provider value={client}>{children}</WildwoodContext.Provider>;
}
