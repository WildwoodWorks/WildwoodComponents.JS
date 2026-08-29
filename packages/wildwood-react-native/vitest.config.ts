import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Absolute, so the aliases resolve from modules nested under src/ too - a relative alias is only
// resolved against the project root and breaks for imports made deeper in the graph.
const mock = (name: string) => fileURLToPath(new URL(`./src/__mocks__/${name}.ts`, import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
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
      'react-native': mock('react-native'),
      // expo-iap is an optional peer and is not installed here. The alias gives the lazy
      // `import('expo-iap')` something resolvable so tests can vi.mock the specifier.
      'expo-iap': mock('expo-iap'),
    },
  },
});
