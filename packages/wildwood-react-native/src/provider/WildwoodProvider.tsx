import { useMemo, useEffect, type ReactNode } from 'react';
import { createWildwoodClient, type ThemeName, type WildwoodConfig } from '@wildwood/core';
import { WildwoodContext } from './WildwoodContext';
import { ThemeContext } from '../styles/ThemeContext';
import { resolveTheme, type WildwoodTheme } from '../styles/theme';

export interface WildwoodProviderProps {
  config: WildwoodConfig;
  children: ReactNode;
  /**
   * Component colours and shape. Accepts a built-in theme name ('woodland-warm' | 'cool-blue' |
   * 'fall-colors') or a partial token override, which is layered over the default exactly as
   * redefining a subset of `--ww-*` on `:root` is on the web. Omit for the default theme.
   */
  theme?: ThemeName | Partial<WildwoodTheme>;
}

export function WildwoodProvider({ config, children, theme }: WildwoodProviderProps) {
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

  // Resolved here rather than in each consumer so the merge with the default theme happens once
  // per theme change, not once per component per render.
  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme]);

  return (
    <WildwoodContext.Provider value={client}>
      <ThemeContext.Provider value={resolvedTheme}>{children}</ThemeContext.Provider>
    </WildwoodContext.Provider>
  );
}
