'use client';

import { useContext } from 'react';
import type { WildwoodClient } from '@wildwood/core';
import { WildwoodContext } from '../provider/WildwoodContext.js';

/** Access the WildwoodClient instance from context */
export function useWildwood(): WildwoodClient {
  const client = useContext(WildwoodContext);
  if (!client) {
    throw new Error('useWildwood must be used within a <WildwoodProvider>');
  }
  return client;
}
