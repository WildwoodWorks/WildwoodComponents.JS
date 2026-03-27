#!/usr/bin/env node
// Reports bundle sizes for all packages after build.
// Usage: pnpm size (run after pnpm build)

import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { gzipSync } from 'zlib';
import { readFileSync } from 'fs';

const packages = ['wildwood-core', 'wildwood-react', 'wildwood-react-native', 'wildwood-node'];
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(1)} kB` : `${(kb / 1024).toFixed(2)} MB`;
}

function getGzipSize(filePath) {
  const content = readFileSync(filePath);
  return gzipSync(content).length;
}

console.log('');
console.log('Package Bundle Sizes');
console.log('='.repeat(70));

let totalRaw = 0;
let totalGzip = 0;

for (const pkg of packages) {
  const distDir = join(root, 'packages', pkg, 'dist');
  let files;
  try {
    files = readdirSync(distDir);
  } catch {
    console.log(`\n@wildwood/${pkg.replace('wildwood-', '')}: (not built)`);
    continue;
  }

  const name = `@wildwood/${pkg.replace('wildwood-', '')}`;
  console.log(`\n${name}`);
  console.log('-'.repeat(70));

  let pkgTotal = 0;
  let pkgGzip = 0;

  const entries = files
    .filter((f) => !f.endsWith('.map'))
    .map((f) => {
      const filePath = join(distDir, f);
      const stat = statSync(filePath);
      const gzip = getGzipSize(filePath);
      return { name: f, size: stat.size, gzip };
    })
    .sort((a, b) => b.size - a.size);

  for (const entry of entries) {
    const sizeStr = formatBytes(entry.size).padStart(10);
    const gzipStr = formatBytes(entry.gzip).padStart(10);
    console.log(`  ${entry.name.padEnd(30)} ${sizeStr}  (gzip: ${gzipStr})`);
    pkgTotal += entry.size;
    pkgGzip += entry.gzip;
  }

  console.log(
    `  ${'TOTAL'.padEnd(30)} ${formatBytes(pkgTotal).padStart(10)}  (gzip: ${formatBytes(pkgGzip).padStart(10)})`,
  );
  totalRaw += pkgTotal;
  totalGzip += pkgGzip;
}

console.log('\n' + '='.repeat(70));
console.log(
  `ALL PACKAGES                   ${formatBytes(totalRaw).padStart(10)}  (gzip: ${formatBytes(totalGzip).padStart(10)})`,
);
console.log('');
