import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

export default defineConfig({
  entry: ['src/index.ts', 'src/testing/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // @playwright/test is external and an OPTIONAL peer: only the ./testing entry point imports it,
  // so an app that never writes Playwright tests must not be made to install it.
  external: ['react', 'react/jsx-runtime', '@wildwood/core', '@wildwood/react-shared', '@playwright/test'],
  onSuccess: async () => {
    // Copy CSS files to dist for consumers to import
    mkdirSync(resolve('dist'), { recursive: true });
    copyFileSync(resolve('src/styles/wildwood-themes.css'), resolve('dist/wildwood-themes.css'));
    copyFileSync(resolve('src/styles/components.css'), resolve('dist/components.css'));
  },
});
