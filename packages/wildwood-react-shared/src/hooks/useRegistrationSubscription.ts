'use client';

// The two server reads every registration-and-subscription screen needs, plus the one call every
// one of them has to make when it is done: tell the rest of the app the entitlements moved.

import { useCallback } from 'react';
import type { PublicCatalog, WildwoodClient } from '@wildwood/core';
import type { SignupRegistrationMode, SignupTokenMode } from '../authentication/registrationMode.js';
import type { EntitlementsChangedReason } from '../subscription/entitlements.js';
import { useWildwood } from './useWildwood.js';
import { useRegistrationMode } from './useRegistrationMode.js';
import { usePublicCatalog } from './usePublicCatalog.js';
import { invalidateFeatures } from './useFeatures.js';

export interface UseRegistrationSubscriptionOptions {
  /** Defaults to the client's configured app. */
  appId?: string;
  /** Used only when the server's catalog responses carry no currency. */
  currency?: string;
  /** A catalog built during a server render, for a first paint with real prices. */
  initialCatalog?: PublicCatalog | null;
  /** `'required'` is invite redemption. */
  tokenMode?: SignupTokenMode;
  /** Set false to hold both requests back. Defaults to true. */
  enabled?: boolean;
}

export interface UseRegistrationSubscriptionReturn {
  catalog: PublicCatalog | null;
  catalogLoading: boolean;
  catalogError: string | null;
  refreshCatalog: () => Promise<void>;
  mode: SignupRegistrationMode;
  modeLoading: boolean;
  modeError: string | null;
  /** The client the views drive their own calls with. */
  client: WildwoodClient;
  /**
   * Announce that the signed-in user's entitlements just changed: clears the shared feature cache
   * and refreshes every mounted gate, then emits `entitlementsChanged` for anything else listening.
   */
  notifyEntitlementsChanged: (reason: EntitlementsChangedReason) => void;
}

/**
 * Compose {@link useRegistrationMode} and {@link usePublicCatalog} for a signup or subscription
 * screen.
 */
export function useRegistrationSubscription(
  options: UseRegistrationSubscriptionOptions = {},
): UseRegistrationSubscriptionReturn {
  const client = useWildwood();
  const appId = options.appId ?? client.config.appId ?? '';
  const { currency, initialCatalog, tokenMode, enabled } = options;

  const registrationMode = useRegistrationMode(appId, { tokenMode, enabled });
  const publicCatalog = usePublicCatalog(appId, { currency, initialCatalog, enabled });

  const notifyEntitlementsChanged = useCallback(
    (reason: EntitlementsChangedReason) => {
      // The feature map is what gates render from, so it has to be dropped first.
      invalidateFeatures();
      // The catalog is deliberately NOT invalidated: buying something does not change the price
      // list, and dropping it would make every purchase refetch the whole catalog for nothing.
      client.events.emit('entitlementsChanged', { appId, reason });
    },
    [client, appId],
  );

  return {
    catalog: publicCatalog.catalog,
    catalogLoading: publicCatalog.loading,
    catalogError: publicCatalog.error,
    refreshCatalog: publicCatalog.refresh,
    mode: registrationMode.mode,
    modeLoading: registrationMode.loading,
    modeError: registrationMode.error,
    client,
    notifyEntitlementsChanged,
  };
}
