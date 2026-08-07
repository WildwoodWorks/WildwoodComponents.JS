import { defineConfig } from '@playwright/test';

/**
 * The CSP capture test stands alone, deliberately.
 *
 * `playwright.config.ts` boots the full test-suite app to exercise the components against a live
 * Wildwood API. This test needs the opposite: a bare origin whose response headers it controls,
 * with no app, no API and no auth in the way — the thing under test is a browser policy decision,
 * and anything else on the page is noise that can only make it flaky. It therefore starts its own
 * fixture server inside the spec and declares no `webServer` here.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /csp-capture\.spec\.ts/,
  timeout: 60_000,
  retries: 0,
  projects: [
    {
      name: 'chromium',
      // No screen-capture launch flags: every test in this spec deletes `navigator.mediaDevices`,
      // because the guarantee under test is that capture works with no such API at all.
      use: { browserName: 'chromium' },
    },
  ],
});
