'use client';

// Feature-gating hook: one bulk fetch of the user's feature entitlements
// (GET api/app-tiers/{appId}/user-features) shared across every gate in the app.
//
// Why not useAppTier().checkFeature()? That helper is a per-call network round-trip —
// gating a handful of buttons with it hammers the API on every render. This hook loads
// the bulk map once, shares it via a module-level cache (so N components = 1 request),
// and refreshes on auth changes and entitlement mutations (see invalidateFeatures).
//
// Failure policy: FAIL OPEN. Client-side gating is UX; the server enforces the real
// entitlement. A transient fetch failure is never cached and never locks gates —
// hasFeature() returns true while entitlements are unknown, and `error` signals staleness.

import { useState, useEffect, useCallback } from 'react';
import type { WildwoodClient } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

interface CacheEntry {
  promise: Promise<Record<string, boolean>>;
  loadedAt: number;
}

const featureCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

// One module-level auth listener per client (NOT per hook instance): it clears the shared
// cache once and notifies mounted instances, which reload THROUGH the shared cache — so a
// login/logout with N mounted gates triggers one refetch, not N parallel ones.
const subscribers = new Set<() => void>();
const authListenerAttached = new WeakSet<WildwoodClient>();

function ensureAuthListener(client: WildwoodClient): void {
  if (authListenerAttached.has(client)) return;
  authListenerAttached.add(client);
  client.events.on('authChanged', () => {
    featureCache.clear();
    for (const notify of [...subscribers]) notify();
  });
}

function loadFeatures(client: WildwoodClient, appId: string): Promise<Record<string, boolean>> {
  const cached = featureCache.get(appId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.promise;
  }
  const promise = client.appTier.getUserFeatures(appId).then((map) => {
    // Normalize keys so lookups are case-insensitive (codes are conventionally
    // UPPER_SNAKE, but callers have used lowercase variants).
    const normalized: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(map ?? {})) {
      normalized[key.toUpperCase()] = value;
    }
    return normalized;
  });
  // Never cache a failure: a transient error must not lock every gate for the TTL.
  promise.catch(() => {
    if (featureCache.get(appId)?.promise === promise) {
      featureCache.delete(appId);
    }
  });
  featureCache.set(appId, { promise, loadedAt: Date.now() });
  return promise;
}

/** Drop all cached feature maps (does not refresh mounted hooks — see invalidateFeatures). */
export function clearFeatureCache(): void {
  featureCache.clear();
}

/**
 * Clear the cache AND refresh every mounted useFeatures/FeatureGate instance. Call after
 * entitlement-changing mutations (tier change/subscribe/cancel, feature overrides, add-on
 * purchases) so gates elsewhere in the app don't serve the old plan for the cache TTL.
 * useSubscriptionAdmin's mutation methods call this automatically.
 */
export function invalidateFeatures(): void {
  featureCache.clear();
  for (const notify of [...subscribers]) notify();
}

export interface UseFeaturesReturn {
  /** Normalized (upper-cased key) feature map, or null until the first load resolves. */
  features: Record<string, boolean> | null;
  /**
   * Whether the user's plan includes the feature (case-insensitive). FAILS OPEN while
   * entitlements are unknown (still loading, or the fetch errored): returns true, because the
   * server enforces the real entitlement and wrongly locking paid features is worse than
   * briefly showing them. Pair with `loading` to render a skeleton instead.
   */
  hasFeature: (featureCode: string) => boolean;
  loading: boolean;
  error: string | null;
  /** Bypass the shared cache and refetch. */
  refresh: () => Promise<void>;
}

export function useFeatures(options?: { appId?: string }): UseFeaturesReturn {
  const client = useWildwood();
  const appId = options?.appId ?? client.config.appId ?? '';

  const [features, setFeatures] = useState<Record<string, boolean> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!appId) {
      setError('No appId provided');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setFeatures(await loadFeatures(client, appId));
      setError(null);
    } catch (err) {
      // Keep any previously loaded map (stale beats wrongly-locked); error signals staleness.
      setError(err instanceof Error ? err.message : 'Failed to load features');
    } finally {
      setLoading(false);
    }
  }, [client, appId]);

  useEffect(() => {
    ensureAuthListener(client);
    void load();

    const notify = () => void load();
    subscribers.add(notify);
    return () => {
      subscribers.delete(notify);
    };
  }, [client, load]);

  const hasFeature = useCallback(
    (featureCode: string) => {
      if (features == null) return true; // unknown → fail open; the server enforces
      return features[featureCode.toUpperCase()] === true;
    },
    [features],
  );

  const refresh = useCallback(async () => {
    featureCache.delete(appId);
    await load();
  }, [appId, load]);

  return { features, hasFeature, loading, error, refresh };
}
