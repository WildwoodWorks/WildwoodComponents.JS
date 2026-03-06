'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { createWildwoodClient, type WildwoodConfig } from '@wildwood/core';
import { WildwoodContext } from './WildwoodContext.js';

export interface WildwoodProviderProps {
  config: WildwoodConfig;
  children: ReactNode;
}

export function WildwoodProvider({ config, children }: WildwoodProviderProps) {
  const configRef = useRef(config);
  const client = useMemo(() => createWildwoodClient(configRef.current), []);

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
