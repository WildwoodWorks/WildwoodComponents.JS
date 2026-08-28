import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
   * redefining a subset of `--ww-*` on `:root` is on the web.
   *
   * Omit it to follow the user's own theme instead: the app then tracks ThemeService, so a stored
   * preference is applied on launch and `useTheme().setTheme(name)` restyles live. Pass an object
   * when the app has ONE brand palette that a user preference should not override — and hoist it
   * to module scope, since a fresh literal each render rebuilds every component's StyleSheet.
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

  /* The theme ThemeService currently holds. Only consulted when the consumer passed no `theme`,
     but tracked unconditionally so switching from a service-driven theme to an explicit one (or
     back) does not need a remount. Without this the service was inert for styling: setTheme()
     persisted the choice and emitted themeChanged, and nothing on screen moved. */
  const [serviceTheme, setServiceTheme] = useState<ThemeName>(() => client.theme.theme);

  useEffect(() => {
    let cancelled = false;
    client.session.initialize();

    /* AWAIT the restore. ThemeService.initialize() reads storage asynchronously and does NOT emit
       themeChanged when it lands — it only sets a DOM attribute, which is inert here — so reading
       `client.theme.theme` synchronously after the call returns the pre-restore default and the
       stored preference never reaches the UI. */
    client.theme
      .initialize()
      .then(() => {
        if (!cancelled) setServiceTheme(client.theme.theme);
      })
      .catch(() => {
        /* Storage unavailable: keep the default rather than failing the whole provider. */
      });

    // setTheme() DOES emit, so later switches arrive here.
    const unsubscribe = client.events.on('themeChanged', (name) => setServiceTheme(name));
    return () => {
      cancelled = true;
      unsubscribe();
      client.session.dispose();
    };
  }, [client]);

  /* Resolved here rather than in each consumer so the merge with the default happens once per
     theme change, not once per component per render. An explicit `theme` prop wins over the
     service: an app that ships one brand palette should not have it swapped by a stored
     preference. */
  const resolvedTheme = useMemo(
    () => resolveTheme(theme ?? serviceTheme),
    [theme, serviceTheme],
  );

  return (
    <WildwoodContext.Provider value={client}>
      <ThemeContext.Provider value={resolvedTheme}>{children}</ThemeContext.Provider>
    </WildwoodContext.Provider>
  );
}
