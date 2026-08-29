// Placeholder for the optional expo-iap peer, which is deliberately NOT installed in this package.
// vitest.config.ts aliases 'expo-iap' here so the lazy `import('expo-iap')` in useInAppPurchases
// resolves under vitest; each test replaces this module with vi.doMock to script the store.
// Nothing exported here is a working store connection - a test that reaches these has not mocked.
export function initConnection(): Promise<boolean> {
  return Promise.resolve(false);
}
