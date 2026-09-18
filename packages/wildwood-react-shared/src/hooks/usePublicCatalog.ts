'use client';

// What the app sells, loaded once and shared.
//
// A pricing table, a signup screen and an upgrade modal on the same page all want the same two
// public responses, so this follows the useFeatures pattern: a module-level cache keyed by appId
// with one in-flight promise, so N mounted instances make ONE pair of requests. A failure is never
// cached — a transient error must not leave the app looking like it sells nothing for a minute.
//
// SSR-safe: nothing here touches window/document, and a snapshot built during a server render can
// be handed in as `initialCatalog` so the browser renders prices on the first paint instead of a
// spinner.

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildPublicCatalog, type PublicCatalog, type WildwoodClient } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

interface CacheEntry {
  promise: Promise<PublicCatalog>;
  loadedAt: number;
}

const catalogCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

const subscribers = new Set<() => void>();

function fetchCatalog(client: WildwoodClient, appId: string, currency?: string): Promise<PublicCatalog> {
  // Both endpoints are public and independent, so they go together rather than one after the other.
  return Promise.all([client.appTier.getPublicTiers(appId), client.appTier.getPublicAddOns(appId)]).then(
    ([tiers, addOns]) => buildPublicCatalog({ appId, tiers, addOns, currencyOverride: currency }),
  );
}

function loadPublicCatalog(
  client: WildwoodClient,
  appId: string,
  currency: string | undefined,
  force: boolean,
): Promise<PublicCatalog> {
  const cached = catalogCache.get(appId);
  if (!force && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.promise;
  }
  const promise = fetchCatalog(client, appId, currency);
  // Never cache a failure: the next mount has to be allowed to try again immediately.
  promise.catch(() => {
    if (catalogCache.get(appId)?.promise === promise) {
      catalogCache.delete(appId);
    }
  });
  catalogCache.set(appId, { promise, loadedAt: Date.now() });
  return promise;
}

/**
 * Put a catalog into the shared cache without fetching — the SSR snapshot path. `usePublicCatalog`
 * does this for you when you pass `initialCatalog`.
 */
export function seedPublicCatalog(appId: string, catalog: PublicCatalog): void {
  if (!appId || !catalog) return;
  catalogCache.set(appId, { promise: Promise.resolve(catalog), loadedAt: Date.now() });
}

/** Drop cached catalogs (does not refresh mounted hooks — see invalidatePublicCatalog). */
export function clearPublicCatalogCache(): void {
  catalogCache.clear();
}

/**
 * Drop one app's catalog (or every app's) AND refresh every mounted `usePublicCatalog`.
 *
 * Buying something does NOT change what an app sells, so the purchase paths deliberately do not
 * call this. It is for an operator changing the price list.
 */
export function invalidatePublicCatalog(appId?: string): void {
  if (appId) {
    catalogCache.delete(appId);
  } else {
    catalogCache.clear();
  }
  for (const notify of [...subscribers]) notify();
}

export interface UsePublicCatalogOptions {
  /** Used only when the server's responses carry no currency (an older API). */
  currency?: string;
  /** A catalog built during a server render: used on the first render and seeded into the cache. */
  initialCatalog?: PublicCatalog | null;
  /** Set false to hold the requests back. Defaults to true. */
  enabled?: boolean;
}

export interface UsePublicCatalogReturn {
  catalog: PublicCatalog | null;
  loading: boolean;
  error: string | null;
  /** Bypass the shared cache and reload. */
  refresh: () => Promise<void>;
}

/**
 * Load the app's public tiers and packs as one {@link PublicCatalog}.
 *
 * @param appId Defaults to the client's configured app.
 */
export function usePublicCatalog(appId?: string, options: UsePublicCatalogOptions = {}): UsePublicCatalogReturn {
  const client = useWildwood();
  const resolvedAppId = appId ?? client.config.appId ?? '';
  const { currency, initialCatalog, enabled = true } = options;

  const [catalog, setCatalog] = useState<PublicCatalog | null>(() => {
    if (!initialCatalog) return null;
    // Seed before the first effect runs so siblings reuse the snapshot instead of refetching.
    seedPublicCatalog(resolvedAppId, initialCatalog);
    return initialCatalog;
  });
  const [loading, setLoading] = useState(() => enabled && Boolean(resolvedAppId) && !initialCatalog);
  const [error, setError] = useState<string | null>(null);

  // Mirrors `catalog` so `load` can tell "nothing to show yet" from "refreshing what is on screen".
  const catalogRef = useRef<PublicCatalog | null>(catalog);
  catalogRef.current = catalog;

  // Only the newest request may write state; an unmount or an appId change retires the rest.
  const sequence = useRef(0);

  const load = useCallback(
    async (force: boolean) => {
      if (!enabled || !resolvedAppId) {
        setLoading(false);
        return;
      }
      const mine = (sequence.current += 1);
      // A background refresh must not blank prices that are already on screen.
      if (catalogRef.current == null) setLoading(true);
      try {
        const next = await loadPublicCatalog(client, resolvedAppId, currency, force);
        if (mine !== sequence.current) return;
        setCatalog(next);
        setError(null);
      } catch (err) {
        if (mine !== sequence.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load the catalog');
      } finally {
        if (mine === sequence.current) setLoading(false);
      }
    },
    [client, resolvedAppId, currency, enabled],
  );

  useEffect(() => {
    void load(false);

    const notify = () => void load(false);
    subscribers.add(notify);
    return () => {
      subscribers.delete(notify);
      sequence.current += 1;
    };
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { catalog, loading, error, refresh };
}
