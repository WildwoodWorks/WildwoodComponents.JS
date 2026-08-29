import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
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
