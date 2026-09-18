/**
 * A component that names a class the stylesheet never defines renders unstyled — the add-on panel and
 * the whole usage dashboard shipped that way. This guard keeps the gap from reopening for the
 * subscription, payment, registration, usage and pricing surfaces.
 *
 * Deliberately scoped to those files: it is a regression guard, not a whole-package audit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const COMPONENTS = [
  'components/subscription/admin/AddOnsPanel.tsx',
  'components/subscription/admin/SubscriptionAdminComponent.tsx',
  'components/subscription/admin/SubscriptionStatusPanel.tsx',
  'components/payment/PaymentComponent.tsx',
  'components/registration/SignupWithSubscriptionComponent.tsx',
  'components/usage/UsageDashboardComponent.tsx',
  'components/pricing/PricingDisplayComponent.tsx',
];

/**
 * Every `ww-*` token the file mentions as a class. Classes are not all written in a `className`
 * attribute (helpers return them as bare strings), so the whole source is scanned and the two other
 * things that wear a `ww-` name are removed first: CSS custom properties (`--ww-*`, read through
 * `getPropertyValue`) and element ids (`id=` / `htmlFor=`).
 */
function classesUsedIn(source: string): Set<string> {
  const cleaned = source.replace(/--ww-[a-zA-Z0-9-]+/g, '').replace(/\b(?:id|htmlFor)=(["'])[^"']*\1/g, '');
  return new Set(cleaned.match(/\bww-[a-z0-9]+(?:-[a-z0-9]+)*\b/g) ?? []);
}

function selectorsIn(css: string): Set<string> {
  return new Set((css.match(/\.ww-[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []).map((selector) => selector.slice(1)));
}

const stylesheet = selectorsIn(readFileSync(resolve(SRC, 'styles/components.css'), 'utf8'));

describe('components.css covers the classes these components use', () => {
  it.each(COMPONENTS)('%s', (file) => {
    const used = [...classesUsedIn(readFileSync(resolve(SRC, file), 'utf8'))].sort();
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((className) => !stylesheet.has(className))).toEqual([]);
  });
});
