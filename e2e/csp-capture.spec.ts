/**
 * The feedback widget's screenshot capture, under a Content-Security-Policy that forbids
 * third-party scripts — the condition that produced the original bug report.
 *
 * This is the only test in the suite that can prove the fix, because the thing being fixed is a
 * BROWSER policy decision: jsdom has no CSP engine, so a unit test cannot tell a same-origin
 * chunk from a cdnjs URL. Here the fixture is bundled the way a consuming app bundles it, served
 * from an origin whose response headers carry the exact policy the SiteDataBridge admin sends,
 * and driven in Chromium.
 *
 * `getDisplayMedia` is DELETED in every test here. That is the point: before html2canvas was a
 * bundled dependency the CDN was refused and the browser's Screen Capture API was the only route
 * left, so every capture raised a share prompt and dismissing it produced nothing. If these tests
 * pass with no screen-capture API present at all, that route is genuinely gone.
 */
import { test, expect, type Page } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as esbuild from 'esbuild';

// Playwright runs with the config's directory (the repo root) as cwd. Derived that way rather
// than from import.meta.url, which Playwright's TypeScript loader emits as CJS and cannot use.
const HERE = path.resolve(process.cwd(), 'e2e');

/**
 * Modelled on the policy SiteDataBridge serves in production (apps/api/src/app.ts). The directive
 * that decides this test — `script-src 'self'` — is that header's verbatim; the rest is trimmed to
 * what a bare fixture page needs, so `connect-src` and `frame-ancestors` differ from the original.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>csp capture</title>
<style>
body{font:14px sans-serif;margin:0;padding:24px;height:2000px;background:linear-gradient(#eef,#fee)}
.ww-feedback-capture-overlay{position:fixed;inset:0;z-index:2147483001;cursor:crosshair;background:rgba(0,0,0,.3)}
.ww-feedback-capture-selection{position:absolute;border:2px dashed #4A90D9;background:rgba(74,144,217,.1)}
.ww-feedback-annotation-overlay{position:fixed;inset:0;z-index:2147483002;background:rgba(30,30,30,.92)}
.ann-cancel-btn{position:fixed;left:8px;top:8px;z-index:2147483003}
</style></head><body>
<h1>Capture under a strict CSP</h1>
<button id="area">Capture Area</button><button id="full">Full Page</button>
<p>Filler content so there is something to capture.</p>
<script type="module" src="/main.js"></script>
</body></html>`;

let server: http.Server;
let origin: string;
let outDir: string;
/** When true the server never answers requests for code-split chunks, modelling a stalled fetch. */
let stallChunks = false;

test.beforeAll(async () => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-csp-capture-'));
  // Bundled the way a consumer bundles it: code-split, so the html2canvas dynamic import becomes
  // its own chunk fetched from this origin. That chunk is precisely what a `script-src 'self'`
  // policy permits and a cdnjs URL is not.
  await esbuild.build({
    entryPoints: [path.join(HERE, 'fixtures', 'csp-capture', 'main.ts')],
    bundle: true,
    format: 'esm',
    splitting: true,
    outdir: outDir,
    entryNames: 'main',
    chunkNames: 'chunks/[name]-[hash]',
    logLevel: 'silent',
  });

  server = http.createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    if (url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': CSP });
      res.end(PAGE);
      return;
    }
    const file = path.join(outDir, url.replace(/^\//, ''));
    if (!file.startsWith(outDir) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    if (stallChunks && url.startsWith('/chunks/')) return; // deliberately never responds
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Content-Security-Policy': CSP });
    res.end(fs.readFileSync(file));
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture server did not bind');
  origin = `http://127.0.0.1:${address.port}/`;
});

test.afterAll(async () => {
  stallChunks = false;
  await new Promise<void>((r) => server.close(() => r()));
  fs.rmSync(outDir, { recursive: true, force: true });
});

/** Remove the Screen Capture API entirely, so nothing can silently fall back to a share prompt. */
async function withoutScreenCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  });
}

async function dragAndSkip(page: Page): Promise<void> {
  await page.locator('.ww-feedback-capture-overlay').waitFor({ timeout: 15_000 });
  await page.mouse.move(150, 150);
  await page.mouse.down();
  await page.mouse.move(450, 400, { steps: 8 });
  await page.mouse.up();
  await page.locator('.ann-cancel-btn').waitFor({ timeout: 15_000 });
  await page.locator('.ann-cancel-btn').click();
}

async function result(page: Page) {
  await expect.poll(() => page.evaluate(() => window.__result), { timeout: 15_000 }).not.toBeNull();
  return page.evaluate(() => window.__result);
}

test('Capture Area works under script-src self with no screen-capture API at all', async ({ page }) => {
  await withoutScreenCapture(page);
  await page.goto(origin);

  await page.click('#area');
  await dragAndSkip(page);

  const outcome = await result(page);
  expect(outcome?.ok, `capture failed: ${outcome?.reason} ${outcome?.message}`).toBe(true);
  expect(outcome?.value).toContain('data:image/jpeg;base64,');
  // Nothing was refused: the library came from this origin, not from a CDN.
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
});

test('Full Page works under script-src self with no screen-capture API at all', async ({ page }) => {
  await withoutScreenCapture(page);
  await page.goto(origin);

  await page.click('#full');
  await page.locator('.ann-cancel-btn').waitFor({ timeout: 15_000 });
  await page.locator('.ann-cancel-btn').click();

  const outcome = await result(page);
  expect(outcome?.ok, `capture failed: ${outcome?.reason} ${outcome?.message}`).toBe(true);
  expect(outcome?.value).toContain('data:image/jpeg;base64,');
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
});

test('a chunk that never arrives settles instead of hanging', async ({ page }) => {
  // The bundled import is same-origin but still a network fetch, and a stalled one must not
  // strand the widget: it hides itself (display:none) for the duration of a capture, so a promise
  // that never settles leaves the user no way back but a page reload.
  //
  // The assertion is that it SETTLES, not that it succeeds. Screen capture is removed here on
  // purpose — whether headless Chromium will grant getDisplayMedia is an environment question,
  // and hanging the whole guarantee off it would make this test flaky for a reason unrelated to
  // what it checks. With every route exhausted the capture must still come back, and promptly,
  // with a cause the widget can explain.
  await withoutScreenCapture(page);
  try {
    // Navigate FIRST, then start stalling: esbuild's entry statically imports a shared chunk, so
    // refusing chunk requests any earlier would stall the page load rather than the dynamic
    // import this test is about.
    await page.goto(origin);
    stallChunks = true;
    await page.click('#area');

    const outcome = await result(page);
    expect(outcome?.ok).toBe(false);
    expect(outcome?.reason).toBeTruthy();
  } finally {
    stallChunks = false;
  }
});
