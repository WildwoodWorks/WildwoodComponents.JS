import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'https://localhost:5280',
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    // The harness package is named wildwood-test-suite-react; the old filter matched no project,
    // so an e2e run with no server already up failed to start one.
    command: 'pnpm --filter wildwood-test-suite-react dev',
    url: 'https://localhost:5280',
    reuseExistingServer: true,
    ignoreHTTPSErrors: true,
    // Generous because a cold machine — a CI runner, or a fresh clone — builds Vite's dependency
    // cache on the first request, which 30s was never sized for. A developer with a server already
    // up is unaffected: `reuseExistingServer` means nothing is started and nothing is waited for.
    timeout: 120000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
