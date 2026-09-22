import { defineConfig } from 'tsup';

export default defineConfig({
  // The ./testing subpath is built as its own entry so that importing it pulls in the identifier
  // contract and the step readers alone - it brings no runner and no react-native import, which is
  // what lets it be imported from a plain Node script.
  entry: ['src/index.ts', 'src/testing/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: [
    'react',
    'react-native',
    'react/jsx-runtime',
    '@wildwood/core',
    '@wildwood/react-shared',
    '@react-native-async-storage/async-storage',
    // Optional peer: loaded lazily by useInAppPurchases, never bundled.
    'expo-iap',
    // Optional peers: loaded lazily by useExpoProviderSignIn, never bundled.
    'expo-auth-session',
    'expo-web-browser',
    'expo-apple-authentication',
  ],
});
