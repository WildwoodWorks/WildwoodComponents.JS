import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['react', 'react/jsx-runtime', '@wildwood/core', '@wildwood/react-shared'],
  onSuccess: async () => {
    // Copy CSS files to dist for consumers to import
    mkdirSync(resolve('dist'), { recursive: true });
    copyFileSync(resolve('src/styles/wildwood-themes.css'), resolve('dist/wildwood-themes.css'));
    copyFileSync(resolve('src/styles/components.css'), resolve('dist/components.css'));
  },
});
