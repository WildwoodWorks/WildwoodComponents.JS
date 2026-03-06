import { useState, useEffect, useCallback } from 'react';
import type { ThemeName } from '@wildwood/core';
import { useWildwood } from './useWildwood';

export interface UseThemeReturn {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => Promise<void>;
}

export function useTheme(): UseThemeReturn {
  const client = useWildwood();
  const [theme, setThemeState] = useState<ThemeName>(client.theme.theme);

  useEffect(() => {
    return client.events.on('themeChanged', (newTheme) => {
      setThemeState(newTheme as ThemeName);
    });
  }, [client]);

  const setTheme = useCallback(async (newTheme: ThemeName) => {
    await client.theme.setTheme(newTheme);
  }, [client]);

  return { theme, setTheme };
}
