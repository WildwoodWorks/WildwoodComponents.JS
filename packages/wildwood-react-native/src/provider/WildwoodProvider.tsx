import { useMemo, useEffect, type ReactNode } from 'react';
import { createWildwoodClient, type WildwoodConfig } from '@wildwood/core';
import { WildwoodContext } from './WildwoodContext';

export interface WildwoodProviderProps {
  config: WildwoodConfig;
  children: ReactNode;
}

export function WildwoodProvider({ config, children }: WildwoodProviderProps) {
  const client = useMemo(() => {
    // React Native should use 'memory' storage by default
    // Consumers can pass a custom StorageAdapter for AsyncStorage
    const effectiveConfig: WildwoodConfig = {
      ...config,
      storage: config.storage ?? 'memory',
    };
    return createWildwoodClient(effectiveConfig);
  }, [config.baseUrl, config.appId, config.storage]);

  useEffect(() => {
    client.session.initialize();
    client.theme.initialize();
    return () => {
      client.session.dispose();
    };
  }, [client]);

  return <WildwoodContext.Provider value={client}>{children}</WildwoodContext.Provider>;
}
