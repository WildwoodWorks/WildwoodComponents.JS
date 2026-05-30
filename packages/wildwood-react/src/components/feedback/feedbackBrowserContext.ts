// Browser context + console capture for the FeedbackComponent.
// Ported from WildwoodAdmin/wwwroot/js/feedback-widget.js (collectBrowserContext +
// captureConsoleAndErrors). Frame-agnostic, guarded for non-browser/SSR environments.

import type { FeedbackBrowserContext, FeedbackConsoleEntry } from '@wildwood/core';

const MAX_CONSOLE_ENTRIES = 50;
const consoleBuffer: FeedbackConsoleEntry[] = [];
let installed = false;

function pushConsoleEntry(level: string, args: unknown[]): void {
  let msg = args
    .map((a) => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
  if (msg.length > 500) msg = msg.substring(0, 500) + '...';
  consoleBuffer.push({ level, message: msg, timestamp: new Date().toISOString() });
  if (consoleBuffer.length > MAX_CONSOLE_ENTRIES) consoleBuffer.shift();
}

/**
 * Patch console.error/warn and window error handlers to record recent diagnostics.
 * Safe to call multiple times (installs once) and is a no-op outside the browser.
 */
export function installConsoleCapture(): void {
  if (installed || typeof window === 'undefined' || typeof console === 'undefined') return;
  installed = true;

  const origError = console.error;
  const origWarn = console.warn;

  console.error = function (...args: unknown[]) {
    pushConsoleEntry('error', args);
    origError.apply(console, args as []);
  };
  console.warn = function (...args: unknown[]) {
    pushConsoleEntry('warn', args);
    origWarn.apply(console, args as []);
  };

  window.addEventListener('error', (e) => {
    pushConsoleEntry('exception', [e.message, `at ${e.filename || ''}:${e.lineno || ''}:${e.colno || ''}`]);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = (e as PromiseRejectionEvent).reason;
    const msg =
      reason instanceof Error
        ? reason.message + (reason.stack ? '\n' + reason.stack.split('\n').slice(0, 3).join('\n') : '')
        : String(reason);
    pushConsoleEntry('unhandledrejection', [msg]);
  });
}

/**
 * Collect a snapshot of browser diagnostics (console buffer, environment,
 * performance timing) as a JSON string suitable for SubmitFeedbackInput.browserContext.
 * Returns null outside the browser.
 */
export function collectBrowserContext(): string | null {
  if (typeof window === 'undefined') return null;

  const ctx: FeedbackBrowserContext = {
    consoleLog: consoleBuffer.slice(),
    environment: {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      screenWidth: typeof screen !== 'undefined' ? screen.width : undefined,
      screenHeight: typeof screen !== 'undefined' ? screen.height : undefined,
      devicePixelRatio: window.devicePixelRatio || 1,
      platform: navigator.platform,
      language: navigator.language,
      languages: navigator.languages ? navigator.languages.slice() : [navigator.language],
      cookiesEnabled: navigator.cookieEnabled,
      online: navigator.onLine,
      colorScheme:
        typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light',
      touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };

  if (typeof performance !== 'undefined') {
    const nav = performance.getEntriesByType
      ? (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)
      : undefined;
    if (nav) {
      ctx.performance = {
        pageLoadMs: Math.round(nav.loadEventEnd - nav.startTime),
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
        firstPaintMs: null,
      };
      const paint = performance.getEntriesByType('paint');
      if (paint && paint.length) {
        const fp = paint.find((p) => p.name === 'first-contentful-paint') || paint[0];
        ctx.performance.firstPaintMs = Math.round(fp.startTime);
      }
    }
    // Chrome-only memory stats
    const perfMemory = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } })
      .memory;
    if (perfMemory) {
      ctx.performance = ctx.performance || {};
      ctx.performance.jsHeapUsedMB = Math.round(perfMemory.usedJSHeapSize / 1048576);
      ctx.performance.jsHeapTotalMB = Math.round(perfMemory.totalJSHeapSize / 1048576);
    }
  }

  return JSON.stringify(ctx);
}
