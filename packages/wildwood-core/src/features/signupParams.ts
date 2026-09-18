// Signup link parameters.
//
// Pure and SSR-safe: the caller supplies the query string (from a router, a request URL, or
// `window.location.search`), so nothing here reads the browser's location itself.

import { asSearchParams, decodeCatalogSelection, type PublicCatalog } from './catalog.js';

/** Everything a signup link can carry. Every value is trimmed; an empty one becomes undefined. */
export interface SignupParams {
  /** The tier the visitor arrived wanting (`?tier=`). */
  tierId?: string;
  /** The pricing option within that tier (`?pricing=`). */
  pricingId?: string;
  /** Packs to pre-select (`?addons=`), de-duplicated and capped. Always an array. */
  addOnIds: string[];
  /** A registration token (`?token=`). */
  token?: string;
  /** An invitation id (`?invite=`). */
  invite?: string;
  /** An email to prefill (`?email=`). */
  email?: string;
}

function readParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

/**
 * Parse a signup URL's query into the selection and identity hints a registration screen needs.
 *
 * Pass the catalog once it has loaded to drop add-on ids the app does not sell — without it the
 * ids are returned as given, which is what a screen that parses before fetching wants.
 */
export function parseSignupParams(search: string | URLSearchParams, catalog?: PublicCatalog | null): SignupParams {
  const params = asSearchParams(search);
  const selection = decodeCatalogSelection(params, catalog);

  return {
    tierId: selection.tierId,
    pricingId: selection.pricingId,
    addOnIds: selection.addOnIds,
    token: readParam(params, 'token'),
    invite: readParam(params, 'invite'),
    email: readParam(params, 'email'),
  };
}
