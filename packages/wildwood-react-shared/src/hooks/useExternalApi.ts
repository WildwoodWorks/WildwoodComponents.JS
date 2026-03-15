'use client';

import { useMemo } from 'react';
import { createExternalApiClient, type ExternalApiClient, type ExternalApiClientOptions } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export type { ExternalApiClient, ExternalApiClientOptions };

/**
 * Creates an authenticated HTTP client for calling the app's own API.
 * Automatically attaches the current Wildwood session JWT as a Bearer token.
 */
export function useExternalApi(options: ExternalApiClientOptions): ExternalApiClient {
  const client = useWildwood();

  return useMemo(
    () => createExternalApiClient(client.session, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, options.baseUrl, options.defaultHeaders, options.timeoutMs],
  );
}
