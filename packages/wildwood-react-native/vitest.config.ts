import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // RN components import react-native which can't run in Node.
    // Only run tests that don't import react-native directly.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      'react-native': './src/__mocks__/react-native.ts',
    },
  },
});
