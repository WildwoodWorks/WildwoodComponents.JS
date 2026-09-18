import type { WildwoodEvents } from '@wildwood/core';

/**
 * Why the signed-in user's entitlements changed. The reason travels on the client's
 * `entitlementsChanged` event so a listener can tell a purchase from a cancellation without
 * re-reading the subscription.
 */
export type EntitlementsChangedReason = WildwoodEvents['entitlementsChanged']['reason'];
