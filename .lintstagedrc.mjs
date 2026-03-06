export default {
  'packages/wildwood-core/src/**/*.{ts,tsx}': () => 'pnpm --filter @wildwood/core lint',
  'packages/wildwood-react/src/**/*.{ts,tsx}': () => 'pnpm --filter @wildwood/react lint',
  'packages/wildwood-react-native/src/**/*.{ts,tsx}': () => 'pnpm --filter @wildwood/react-native lint',
  'packages/wildwood-node/src/**/*.{ts,tsx}': () => 'pnpm --filter @wildwood/node lint',
  '**/*.{ts,tsx,js,mjs,json}': (files) => `prettier --write ${files.join(' ')}`,
};
