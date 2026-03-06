import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/__tests__/**', '**/dist/**', '**/node_modules/**'],
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      'react-native': './src/__mocks__/react-native.ts',
    },
  },
});
