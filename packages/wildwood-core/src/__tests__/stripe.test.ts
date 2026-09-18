import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getStripeInstance, resetStripeInstanceCache } from '../payment/stripe.js';
import { loadStripe } from '../payment/scriptLoader.js';
import { WildwoodError } from '../client/errors.js';

vi.mock('../payment/scriptLoader.js', () => ({
  loadStripe: vi.fn(async () => {}),
}));

const loadStripeMock = vi.mocked(loadStripe);

/** Put a fake browser in place, with the Stripe global the script would have defined. */
function stubBrowser(factory?: unknown): void {
  (globalThis as Record<string, unknown>).window = factory ? { Stripe: factory } : {};
}

function clearBrowser(): void {
  delete (globalThis as Record<string, unknown>).window;
}

beforeEach(() => {
  resetStripeInstanceCache();
  loadStripeMock.mockClear();
  loadStripeMock.mockResolvedValue(undefined);
});

afterEach(() => {
  clearBrowser();
  resetStripeInstanceCache();
});

describe('getStripeInstance', () => {
  it('rejects outside a browser without loading anything', async () => {
    await expect(getStripeInstance('pk_test_1')).rejects.toBeInstanceOf(WildwoodError);
    await expect(getStripeInstance('pk_test_1')).rejects.toThrow('Stripe.js is only available in the browser');
    expect(loadStripeMock).not.toHaveBeenCalled();
  });

  it('rejects an empty publishable key', async () => {
    stubBrowser(vi.fn());
    await expect(getStripeInstance('  ')).rejects.toThrow('A Stripe publishable key is required');
  });

  it('loads Stripe.js once per key and caches the instance', async () => {
    const instances = new Map<string, object>();
    const factory = vi.fn((key: string) => {
      const instance = { key };
      instances.set(key, instance);
      return instance;
    });
    stubBrowser(factory);

    const first = getStripeInstance('pk_test_1');
    const second = getStripeInstance('pk_test_1');

    expect(second).toBe(first); // the very same promise, so a second form never re-loads
    await expect(first).resolves.toBe(await second);
    expect(loadStripeMock).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith('pk_test_1');

    // A different key is a different Stripe account: it gets its own instance.
    const other = await getStripeInstance('pk_test_2');
    expect(other).not.toBe(await first);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(loadStripeMock).toHaveBeenCalledTimes(2);
  });

  it('fails when the script loads but defines no Stripe global', async () => {
    stubBrowser();
    await expect(getStripeInstance('pk_test_1')).rejects.toThrow('window.Stripe is unavailable');
  });

  it('evicts a failed load so a retry can succeed', async () => {
    const factory = vi.fn(() => ({ ok: true }));
    stubBrowser(factory);
    loadStripeMock.mockRejectedValueOnce(new Error('network down'));

    await expect(getStripeInstance('pk_test_1')).rejects.toThrow('network down');

    await expect(getStripeInstance('pk_test_1')).resolves.toEqual({ ok: true });
    expect(loadStripeMock).toHaveBeenCalledTimes(2);
  });

  it('resetStripeInstanceCache forgets everything', async () => {
    const factory = vi.fn(() => ({}));
    stubBrowser(factory);

    await getStripeInstance('pk_test_1');
    resetStripeInstanceCache();
    await getStripeInstance('pk_test_1');

    expect(factory).toHaveBeenCalledTimes(2);
  });
});
