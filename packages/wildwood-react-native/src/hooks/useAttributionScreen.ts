import { useEffect } from 'react';
import type { AttributionService } from '@wildwood/core';
import { useWildwood } from './useWildwood';

/**
 * Records a funnel `page_view` for a screen, as `/<name>`. A native host has no URL for the funnel
 * to read, so screens say where the visitor is. Tracking the same screen twice in a row is ignored,
 * and nothing is sent while the app has funnel tracking off. Never throws.
 */
export function trackScreenView(attribution: Pick<AttributionService, 'track'> | null | undefined, name: string): void {
  try {
    if (typeof name !== 'string' || name.trim().length === 0) return;
    attribution?.track('page_view', { path: name.trim() });
  } catch {
    /* funnel tracking never breaks a screen */
  }
}

/**
 * Funnel `page_view` for a React Native screen. Call it at the top of each screen component; it
 * records the view when the screen mounts and whenever `name` changes. With a navigator that keeps
 * screens mounted (a tab or stack navigator), call `trackScreenView(client.attribution, name)` from
 * the navigator's focus listener (for example React Navigation's `useFocusEffect`) instead, so a
 * return to the screen counts too.
 */
export function useAttributionScreen(name: string): void {
  const client = useWildwood();
  useEffect(() => {
    trackScreenView(client.attribution, name);
  }, [client, name]);
}
