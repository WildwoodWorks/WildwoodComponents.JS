// Fixture entry for the CSP capture test. Exercises the real capture module, bundled the way a
// consuming application bundles it, and served from an origin that forbids third-party scripts.
import {
  captureArea,
  captureFullPage,
} from '../../../packages/wildwood-react/src/components/feedback/feedbackScreenshot.js';

interface Outcome {
  ok: boolean;
  value?: string | null;
  reason?: string;
  message?: string;
}

declare global {
  interface Window {
    __result: Outcome | null;
    __cspViolations: string[];
  }
}

window.__result = null;
window.__cspViolations = [];
document.addEventListener('securitypolicyviolation', (e) => {
  window.__cspViolations.push(e.blockedURI);
});

function run(mode: 'area' | 'full'): void {
  window.__result = null;
  const p = mode === 'area' ? captureArea(80, 500) : captureFullPage(80, 500);
  p.then(
    (v) => {
      window.__result = { ok: true, value: v ? v.slice(0, 24) : null };
    },
    (e: unknown) => {
      const err = e as { reason?: string; message?: string };
      window.__result = { ok: false, reason: err?.reason, message: err?.message };
    },
  );
}

document.getElementById('area')!.addEventListener('click', () => run('area'));
document.getElementById('full')!.addEventListener('click', () => run('full'));
