import React from 'react';
import type { ReactNode } from 'react';
import { WildwoodContext } from '../provider/WildwoodContext.js';
import { createWildwoodClient } from '@wildwood/core';

export function createTestClient() {
  return createWildwoodClient({
    baseUrl: 'https://test.example.com',
    appId: 'test-app-id',
    storage: 'memory',
  });
}

export function createWrapper(client = createTestClient()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <WildwoodContext.Provider value={client}>
        {children}
      </WildwoodContext.Provider>
    );
  };
}
