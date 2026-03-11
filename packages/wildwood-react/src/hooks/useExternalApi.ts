'use client';

import { useMemo } from 'react';
import { createExternalApiClient, type ExternalApiClient, type ExternalApiClientOptions } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export type { ExternalApiClient, ExternalApiClientOptions };

/**
 * Creates an authenticated HTTP client for calling the app's own API.
 * Automatically attaches the current Wildwood session JWT as a Bearer token.
 *
 * This replaces the common pattern of creating a separate axios/fetch client
 * and manually reading tokens from localStorage.
 *
 * @example
 * function ProvidersPage() {
 *   const api = useExternalApi({ baseUrl: '/api' });
 *
 *   useEffect(() => {
 *     api.get('/providers').then(setProviders);
 *   }, [api]);
 *
 *   const handleCreate = async (data) => {
 *     await api.post('/providers', data);
 *   };
 * }
 */
export function useExternalApi(options: ExternalApiClientOptions): ExternalApiClient {
  const client = useWildwood();

  // Memoize so the client reference is stable across renders
  // (changes only if the WildwoodClient or baseUrl changes)
  return useMemo(
    () => createExternalApiClient(client.session, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, options.baseUrl],
  );
}
