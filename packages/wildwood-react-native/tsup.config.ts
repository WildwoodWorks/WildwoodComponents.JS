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
  ],
});
