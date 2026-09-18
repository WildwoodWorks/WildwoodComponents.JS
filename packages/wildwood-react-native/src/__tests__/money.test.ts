/**
 * Money on a native screen comes from `formatMoney`, and the plan the wizard activates comes from
 * the server — neither is a string this package writes for itself.
 *
 * The behavioural half compares the two formatters; the source half guards the components, because
 * this package has no React renderer and a rendering assertion is not available here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatMoney, formatPrice } from '@wildwood/core';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The code, without the comments — which name the old formatter and its bugs on purpose. */
const read = (relative: string) =>
  readFileSync(resolve(SRC, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/** Every surface this stage switched off `formatPrice`. */
const MONEY_FILES = [
  'components/subscription/TierChangeConfirmationModal.tsx',
  'components/tier/TierCardHeader.tsx',
  'components/PricingDisplayComponent.tsx',
  'components/AppTierComponent.tsx',
  'components/SignupWithSubscriptionComponent.tsx',
];

describe('formatMoney is a drop-in for the legacy formatPrice', () => {
  // The seven currencies the old symbol table carried keep their symbol and their fraction digits —
  // JPY's zero decimals included — so a host reading its own screens sees the same prices.
  it.each(['USD', 'EUR', 'GBP', 'JPY', 'INR', 'CAD', 'AUD'])('%s renders exactly as before', (currency) => {
    for (const amount of [0, 9, 79.5, 499.99]) {
      expect(formatMoney(amount, currency)).toBe(formatPrice(amount, currency));
    }
  });

  it('groups thousands, which the symbol table never did', () => {
    // The one difference, and Intl's doing: a four-figure plan reads $1,234.56 rather than $1234.56.
    expect(formatMoney(1234.56, 'USD')).toBe('$1,234.56');
    expect(formatPrice(1234.56, 'USD')).toBe('$1234.56');
  });

  it('stops quoting dollars for a currency the old table never had', () => {
    for (const currency of ['CHF', 'SEK']) {
      expect(formatPrice(79, currency)).toContain('$');
      expect(formatMoney(79, currency)).not.toContain('$');
      expect(formatMoney(79, currency)).toContain('79');
    }
  });

  it('says the code and the amount rather than throwing on an unknown ISO code', () => {
    // Whether Intl knows the code or refuses it, the amount is quoted against the code — never
    // against a dollar sign the app does not bill in.
    expect(formatMoney(12.5, 'XYZ')).toMatch(/^XYZ\s12\.50$/);
  });
});

describe('no component formats money on its own authority', () => {
  it.each(MONEY_FILES)('%s formats through formatMoney', (file) => {
    const source = read(file);
    expect(source).toMatch(/\bformatMoney\b/);
    expect(source).not.toMatch(/\bformatPrice\b/);
  });

  it('the plan-change modal has no hard-coded zero and no private Intl call', () => {
    const source = read('components/subscription/TierChangeConfirmationModal.tsx');
    // '$0.00' quoted dollars to a customer being billed in francs; the private Intl call threw
    // inside the modal for an ISO code it did not know.
    expect(source).not.toContain('$0.00');
    expect(source).not.toContain('Intl.NumberFormat');
  });
});

describe('the signup wizard never subscribes over a token grant', () => {
  const source = read('components/SignupWithSubscriptionComponent.tsx');

  it('routes its only selfSubscribe call through activateSignupPlan', () => {
    const calls = source.match(/client\.appTier\.selfSubscribe\(/g) ?? [];
    expect(calls).toHaveLength(1);

    const start = source.indexOf('activateSignupPlan({');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('});', start);
    const activation = source.slice(start, end);
    // The grant is what the rule turns on, so it has to reach the function that holds the rule.
    expect(activation).toContain('tokenGrant,');
    expect(activation).toContain('client.appTier.selfSubscribe(');
  });
});
