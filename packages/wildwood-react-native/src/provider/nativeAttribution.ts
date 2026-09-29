// Campaign attribution on a native host: the pieces WildwoodProvider wires in, kept free of React so
// they can be tested without a renderer.

import type { AttributionDeviceClass, AttributionPlatform, AttributionServiceOptions } from '@wildwood/core';

/** The shortest screen side (in points) from which a device counts as a tablet. */
export const TABLET_MIN_SHORTEST_SIDE = 600;

/** The slice of react-native's Dimensions this module reads. */
export interface DimensionsSource {
  get(dim: 'window' | 'screen'): { width: number; height: number };
}

/** The slice of react-native's AppState this module subscribes to. */
export interface AppStateSource {
  addEventListener(type: 'change', listener: (state: string) => void): { remove: () => void } | undefined;
}

/** The slice of the attribution service the flush needs. */
export interface FlushableAttribution {
  flush(): Promise<void>;
}

/**
 * Device class from the window's dimensions: a shortest side of 600 points or more is a tablet,
 * anything smaller a phone. Rotation does not change it, since the shortest side stays the same.
 */
export function nativeDeviceClass(dimensions: DimensionsSource): AttributionDeviceClass {
  try {
    const { width, height } = dimensions.get('window');
    const shortest = Math.min(width, height);
    if (Number.isFinite(shortest) && shortest >= TABLET_MIN_SHORTEST_SIDE) return 'tablet';
  } catch {
    /* Dimensions unavailable: report a phone */
  }
  return 'mobile';
}

/**
 * Sends the queued funnel events whenever the app leaves the foreground, since a backgrounded app may
 * be killed before the next timed flush. There is no sendBeacon on a native host, so this is the
 * native stand-in for the web's pagehide flush. Returns the unsubscribe.
 */
export function subscribeAttributionFlush(appState: AppStateSource, attribution: FlushableAttribution): () => void {
  let subscription: { remove: () => void } | undefined;
  try {
    subscription = appState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        try {
          void attribution.flush().catch(() => undefined);
        } catch {
          /* never throw from an AppState listener */
        }
      }
    });
  } catch {
    /* AppState unavailable on this host */
  }
  return () => {
    try {
      subscription?.remove();
    } catch {
      /* already removed */
    }
  };
}

/**
 * The attribution options a native provider builds: the native platform and a screen-derived device
 * class, under whatever the host passed (a host's own `platform` or `getDeviceClass` wins).
 */
export function nativeAttributionOptions(
  hostOptions: AttributionServiceOptions | undefined,
  platform: AttributionPlatform,
  dimensions: DimensionsSource,
): AttributionServiceOptions {
  return {
    platform,
    getDeviceClass: () => nativeDeviceClass(dimensions),
    ...hostOptions,
  };
}
