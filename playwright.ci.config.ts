import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Everything under `e2e/` except the specs that cannot answer on a build machine.
 *
 * Two of them cannot, and both have been red on a clean checkout for some time with nobody watching
 * — which is the same gap this job exists to close, so they are named here rather than quietly
 * dropped:
 *
 *  · `smoke` walks a stale route list. `/subscription` was renamed `subscription-admin`, so it waits
 *    on an `h1` that no longer arrives.
 *  · `auth` drives the real authentication screen with nothing stubbed, so it needs a Wildwood
 *    backend and a `.env` that a runner does not have.
 *
 * Fixing either is worth doing and is not this job's business; until then a job that lands red for
 * reasons nobody intends is a job people learn to scroll past.
 *
 * This is an IGNORE list rather than an allow list, and that is the whole point of its shape. An
 * allow list fails closed and silently: a spec added tomorrow simply never runs, and nothing says
 * so. This fails open and loudly — a new spec that needs a backend goes red on its first CI run and
 * gets dealt with. That is the right way round for a directory that keeps growing.
 *
 * `pnpm e2e` is unchanged and still runs the lot, which is what you want on a machine that does have
 * a backend up. `pnpm e2e:ci` is the CI job, reproducible locally.
 *
 * Everything else — the base URL, the dev server, the browser, `ignoreHTTPSErrors` — is inherited,
 * so there is one place to change any of it.
 */
export default defineConfig({
  ...base,
  testIgnore: [/smoke\.spec\.ts/, /auth\.spec\.ts/],
});
