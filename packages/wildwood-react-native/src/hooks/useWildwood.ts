import { useContext } from 'react';
import type { WildwoodClient } from '@wildwood/core';
import { WildwoodContext } from '../provider/WildwoodContext';

export function useWildwood(): WildwoodClient {
  const client = useContext(WildwoodContext);
  if (!client) {
    throw new Error('useWildwood must be used within a WildwoodProvider');
  }
  return client;
}
