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
  external: ['react', 'react/jsx-runtime', '@wildwood/core'],
  onSuccess: async () => {
    // Copy CSS theme file to dist for consumers to import
    const src = resolve('src/styles/wildwood-themes.css');
    const dest = resolve('dist/wildwood-themes.css');
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  },
});
