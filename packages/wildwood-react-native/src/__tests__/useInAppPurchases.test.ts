import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PaymentCompletionResult, StorePurchase } from '@wildwood/core';

// The store session is exercised directly rather than through the hook: this package has no React
// renderer (no react-dom / @testing-library), and the hook is a thin subscription over the session,
// so the purchase state machine is where the behaviour lives.
type CreateIapSession = typeof import('../hooks/useInAppPurchases').createIapSession;

const PRODUCTS = [{ productId: 'com.app.pro.monthly', tierId: 'tier-pro', pricingId: 'price-monthly' }];

const TWO_PRODUCTS = [
  ...PRODUCTS,
  { productId: 'com.app.plus.monthly', tierId: 'tier-plus', pricingId: 'price-monthly' },
];

/** Scriptable expo-iap double. `emit` plays the purchase listener the store would have fired. */
function createStoreDouble(overrides: Record<string, unknown> = {}) {
  const purchaseListeners: Array<(p: unknown) => void> = [];
  const errorListeners: Array<(e: unknown) => void> = [];
  const removed: string[] = [];

  const mod = {
    initConnection: vi.fn(async () => true),
    endConnection: vi.fn(async () => true),
    fetchProducts: vi.fn(async () => [
      { id: 'com.app.pro.monthly', displayPrice: '$9.99', title: 'Pro Monthly', description: 'Everything in Pro' },
    ]),
    requestPurchase: vi.fn(async () => undefined),
    finishTransaction: vi.fn(async () => undefined),
    getAvailablePurchases: vi.fn(async () => []),
    purchaseUpdatedListener: vi.fn((cb: (p: unknown) => void) => {
      purchaseListeners.push(cb);
      return { remove: () => removed.push('purchase') };
    }),
    purchaseErrorListener: vi.fn((cb: (e: unknown) => void) => {
      errorListeners.push(cb);
      return { remove: () => removed.push('error') };
    }),
    ...overrides,
  };

  return {
    mod,
    removed,
    emitPurchase: (purchase: unknown) => purchaseListeners.forEach((cb) => cb(purchase)),
    emitError: (error: unknown) => errorListeners.forEach((cb) => cb(error)),
  };
}

/** Fresh module graph per test so the lazy expo-iap load re-runs against the current mock. */
async function loadSession(): Promise<CreateIapSession> {
  const mod = await import('../hooks/useInAppPurchases');
  return mod.createIapSession;
}

/** Lets a queued microtask chain (listener -> validate -> finishTransaction) drain. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('expo-iap');
});

describe('useInAppPurchases - expo-iap not installed', () => {
  it('stays inert and explains itself when the import fails', async () => {
    vi.doMock('expo-iap', () => {
      throw new Error("Cannot find module 'expo-iap'");
    });
    const createIapSession = await loadSession();

    const validate = vi.fn<(p: StorePurchase) => Promise<PaymentCompletionResult>>();
    const session = createIapSession({ products: PRODUCTS, validate });
    await session.init();

    expect(session.getState().available).toBe(false);
    // Nothing is surfaced until the app actually tries to buy something.
    expect(session.getState().error).toBeNull();
    // The mapping is still visible so a paywall can render before the store answers.
    expect(session.getState().products).toEqual([{ ...PRODUCTS[0] }]);

    await expect(session.purchaseTier('tier-pro')).resolves.toBeNull();
    expect(session.getState().error).toMatch(/expo-iap is not installed/i);
    expect(validate).not.toHaveBeenCalled();

    await expect(session.restorePurchases()).resolves.toEqual({
      restored: 0,
      error: expect.stringMatching(/expo-iap is not installed/i),
    });
  });
});

describe('useInAppPurchases - store connection failure', () => {
  it('reports the store as unreachable rather than as a missing package', async () => {
    // expo-iap IS installed; the store refuses the connection (no network, sandbox down, …).
    const store = createStoreDouble({ initConnection: vi.fn(async () => false) });
    vi.doMock('expo-iap', () => store.mod);
    const createIapSession = await loadSession();

    const validate = vi.fn<(p: StorePurchase) => Promise<PaymentCompletionResult>>();
    const session = createIapSession({ products: PRODUCTS, validate });
    await session.init();

    expect(session.getState().available).toBe(false);

    await expect(session.purchaseTier('tier-pro')).resolves.toBeNull();
    expect(session.getState().error).toMatch(/could not connect to the store/i);
    expect(session.getState().error).not.toMatch(/not installed/i);
    expect(validate).not.toHaveBeenCalled();

    await expect(session.restorePurchases()).resolves.toEqual({
      restored: 0,
      error: expect.stringMatching(/could not connect to the store/i),
    });
  });
});

describe('useInAppPurchases - purchase flow', () => {
  it('validates the receipt, then finishes the transaction, and resolves the Wildwood id', async () => {
    const store = createStoreDouble();
    vi.doMock('expo-iap', () => store.mod);
    const createIapSession = await loadSession();

    const order: string[] = [];
    store.mod.finishTransaction.mockImplementation(async () => {
      order.push('finishTransaction');
    });
    const validate = vi.fn(async (): Promise<PaymentCompletionResult> => {
      order.push('validate');
      return { success: true, transactionId: 'ww-txn-77' };
    });

    const session = createIapSession({ products: PRODUCTS, validate });
    await session.init();

    expect(session.getState().available).toBe(true);
    // Store metadata is merged onto the mapping.
    expect(session.getState().products[0]).toMatchObject({
      productId: 'com.app.pro.monthly',
      tierId: 'tier-pro',
      localizedPrice: '$9.99',
      title: 'Pro Monthly',
    });

    const purchasing = session.purchaseTier('tier-pro', 'price-monthly');
    await flush();
    expect(session.getState().purchaseState).toBe('purchasing');

    store.emitPurchase({
      productId: 'com.app.pro.monthly',
      purchaseToken: 'jws-signed-transaction',
      id: 'store-txn-1',
    });

    await expect(purchasing).resolves.toBe('ww-txn-77');

    // Platform.OS is 'ios' in the react-native mock -> AppleAppStore (10).
    expect(validate).toHaveBeenCalledWith({
      providerType: 10,
      productId: 'com.app.pro.monthly',
      purchaseToken: 'jws-signed-transaction',
      transactionId: 'store-txn-1',
    });
    // An unvalidated purchase must stay unfinished, so finishing comes strictly after validation.
    expect(order).toEqual(['validate', 'finishTransaction']);
    expect(session.getState().purchaseState).toBe('success');
    expect(session.getState().error).toBeNull();
  });

  it('falls back to jwsRepresentationIos when the purchase has no purchaseToken', async () => {
    const store = createStoreDouble();
    vi.doMock('expo-iap', () => store.mod);
    const createIapSession = await loadSession();

    const validate = vi.fn(async (): Promise<PaymentCompletionResult> => ({ success: true, transactionId: 'ww-1' }));
    const session = createIapSession({ products: PRODUCTS, validate });
    await session.init();

    const purchasing = session.purchaseTier('tier-pro');
    await flush();
    store.emitPurchase({ productId: 'com.app.pro.monthly', jwsRepresentationIos: 'legacy-jws' });
    await expect(purchasing).resolves.toBe('ww-1');
    expect(validate).toHaveBeenCalledWith(expect.objectContaining({ purchaseToken: 'legacy-jws' }));
  });

  it('leaves the transaction unfinished when validation fails', async () => {
    const store = createStoreDouble();
    vi.doMock('expo-iap', () => store.mod);
    const createIapSession = await loadSession();

    const validate = vi.fn(
      async (): Promise<PaymentCompletionResult> => ({ success: false, errorMessage: 'Receipt already used' }),
    );
    const session = createIapSession({ products: PRODUCTS, validate });
    await session.init();

    const purchasing = session.purchaseTier('tier-pro');
    await flush();
    store.emitPurchase({ productId: 'com.app.pro.monthly', purchaseToken: 'jws' });

    await expect(purchasing).resolves.toBeNull();
    // The store must re-deliver this purchase on the next launch.
    expect(store.mod.finishTransaction).not.toHaveBeenCalled();
    expect(session.getState().purchaseState).toBe('failed');
    expect(session.getState().error).toBe('Receipt already used');
  });

  it('treats a shopper cancellation as a non-event', async () => {
    const store = createStoreDouble();
    vi.doMock('expo-iap', () => store.mod);
    const createIapSession = await loadSession();

    const validate = vi.fn<(p: StorePurchase) => Promise<PaymentCompletionResult>>();
    const session = createIapSession({ products: PRODUCTS, validate });
    await session.init();

    const purchasing = session.purchaseTier('tier-pro');
    await flush();
    store.emitError({ code: 'E_USER_CANCELLED', message: 'Cancelled' });

    await expect(purchasing).resolves.toBeNull();
    expect(session.getState().purchaseState).toBe('idle');
    expect(session.getState().error).toBeNull();
    expect(validate).not.toHaveBeenCalled();
    expect(store.mod.finishTransaction).not.toHaveBeenCalled();
  });

  it('reports an Ask to Buy purchase as pending without finishing it', async () => {
    const store = createStoreDouble();
    vi.doMock('expo-iap', () => store.mod);
    const createIapSession = await loadSession();

    const validate = vi.fn<(p: StorePurchase) => Promise<PaymentCompletionResult>>();
    const session = createIapSession({ products: PRODUCTS, validate });
    await session.init();

    const purchasing = session.purchaseTier('tier-pro');
    await flush();
    store.emitPurchase({ productId: 'com.app.pro.monthly', purchaseToken: 'jws', purchaseStateAndroid: 2 });

    await expect(purchasing).resolves.toBeNull();
    expect(session.getState().purchaseState).toBe('pending');
    expect(validate).not.toHaveBeenCalled();
    expect(store.mod.finishTransaction).not.toHaveBeenCalled();
  });

  it('fails the purchase when validation succeeds without a transaction id', async () => {
    const store = createStoreDouble();
    vi.doMock('expo-iap', () => store.mod);
    const createIapSession = await loadSession();

    // Success with nothing to pass to changeTier/selfSubscribe: the tier could never be applied.
    const validate = vi.fn(async (): Promise<PaymentCompletionResult> => ({ success: true }));
    const session = createIapSession({ products: PRODUCTS, validate });
    await session.init();

    const purchasing = session.purchaseTier('tier-pro');
    await flush();
    store.emitPurchase({ productId: 'com.app.pro.monthly', purchaseToken: 'jws', id: 'store-txn-1' });

    await expect(purchasing).resolves.toBeNull();
    expect(session.getState().purchaseState).toBe('failed');
    expect(session.getState().error).toMatch(/no transaction id/i);
    // Left unfinished, so the store re-delivers it and a later validation can still record it.
    expect(store.mod.finishTransaction).not.toHaveBeenCalled();
  });

  it('re-processes the same transaction on a retry after validation failed', async () => {
    const store = createStoreDouble();
    vi.doMock('expo-iap', () => store.mod);
    const createIapSession = await loadSession();

    const validate = vi
      .fn<(p: StorePurchase) => Promise<PaymentCompletionResult>>()
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce({ success: true, transactionId: 'ww-retry' });

    const session = createIapSession({ products: PRODUCTS, validate });
    await session.init();

    // The purchase the store delivers both times: same id, still unfinished.
    const delivered = { productId: 'com.app.pro.monthly', purchaseToken: 'jws', id: 'store-txn-1' };

    const first = session.purchaseTier('tier-pro');
    await flush();
    store.emitPurchase(delivered);
    await expect(first).resolves.toBeNull();
    expect(session.getState().purchaseState).toBe('failed');
    expect(store.mod.finishTransaction).not.toHaveBeenCalled();

    // Same session: the shopper taps Buy again and StoreKit re-delivers the unfinished transaction.
    const second = session.purchaseTier('tier-pro');
    await flush();
    expect(session.getState().purchaseState).toBe('purchasing');
    store.emitPurchase(delivered);

    await expect(second).resolves.toBe('ww-retry');
    expect(validate).toHaveBeenCalledTimes(2);
    expect(session.getState().purchaseState).toBe('success');
    expect(store.mod.finishTransaction).toHaveBeenCalledTimes(1);
  });

  it('completes an Ask to Buy purchase when the approval re-delivers the same token', async () => {
    const store = createStoreDouble();
    vi.doMock('expo-iap', () => store.mod);
    const createIapSession = await loadSession();

    const validate = vi.fn(async (): Promise<PaymentCompletionResult> => ({ success: true, transactionId: 'ww-ask' }));
    const session = createIapSession({ products: PRODUCTS, validate });
    await session.init();

    const purchasing = session.purchaseTier('tier-pro');
    await flush();
    store.emitPurchase({ productId: 'com.app.pro.monthly', purchaseToken: 'play-token', purchaseStateAndroid: 2 });

    await expect(purchasing).resolves.toBeNull();
    expect(session.getState().purchaseState).toBe('pending');
    expect(validate).not.toHaveBeenCalled();

    // The parent approves and Play delivers the SAME purchaseToken, now purchased.
    store.emitPurchase({ productId: 'com.app.pro.monthly', purchaseToken: 'play-token', purchaseStateAndroid: 1 });
    await flush();

    expect(validate).toHaveBeenCalledWith(expect.objectContaining({ purchaseToken: 'play-token' }));
    expect(session.getState().purchaseState).toBe('success');
    expect(store.mod.finishTransaction).toHaveBeenCalledTimes(1);
  });

  it("does not settle the in-flight purchase with another product's transaction", async () => {
    const store = createStoreDouble();
    vi.doMock('expo-iap', () => store.mod);
    const createIapSession = await loadSession();

    const validate = vi.fn(
      async (p: StorePurchase): Promise<PaymentCompletionResult> => ({
        success: true,
        transactionId: p.productId === 'com.app.pro.monthly' ? 'ww-pro' : 'ww-plus',
      }),
    );
    const session = createIapSession({ products: TWO_PRODUCTS, validate });
    await session.init();

    const purchasing = session.purchaseTier('tier-pro', 'price-monthly');
    let settledWith: string | null | undefined;
    void purchasing.then((value) => {
      settledWith = value;
    });
    await flush();

    // An unfinished purchase for the OTHER tier is re-delivered mid-flow.
    store.emitPurchase({ productId: 'com.app.plus.monthly', purchaseToken: 'jws-plus', id: 'store-txn-plus' });
    await flush();

    // It is still validated and finished — it is a real, mapped entitlement — but it is not ours.
    expect(validate).toHaveBeenCalledWith(expect.objectContaining({ productId: 'com.app.plus.monthly' }));
    expect(store.mod.finishTransaction).toHaveBeenCalledTimes(1);
    expect(settledWith).toBeUndefined();
    expect(session.getState().purchaseState).toBe('purchasing');

    store.emitPurchase({ productId: 'com.app.pro.monthly', purchaseToken: 'jws-pro', id: 'store-txn-pro' });
    await expect(purchasing).resolves.toBe('ww-pro');
    expect(session.getState().purchaseState).toBe('success');
  });

  it('refuses a second purchase while one is in flight', async () => {
    const store = createStoreDouble();
    vi.doMock('expo-iap', () => store.mod);
    const createIapSession = await loadSession();

    const validate = vi.fn(async (): Promise<PaymentCompletionResult> => ({ success: true, transactionId: 'ww-1' }));
    const session = createIapSession({ products: PRODUCTS, validate });
    await session.init();

    const first = session.purchaseTier('tier-pro');
    await flush();
    await expect(session.purchaseTier('tier-pro')).rejects.toThrow(/already in progress/i);

    store.emitPurchase({ productId: 'com.app.pro.monthly', purchaseToken: 'jws' });
    await expect(first).resolves.toBe('ww-1');
  });
});

describe('useInAppPurchases - restore and teardown', () => {
  it('re-validates mapped entitlements with isRestore and counts the successes', async () => {
    const store = createStoreDouble({
      getAvailablePurchases: vi.fn(async () => [
        { productId: 'com.app.pro.monthly', purchaseToken: 'jws-restored', id: 'store-txn-9' },
        { productId: 'com.other.app.thing', purchaseToken: 'not-ours' },
      ]),
    });
    vi.doMock('expo-iap', () => store.mod);
    const createIapSession = await loadSession();

    const validate = vi.fn(async (): Promise<PaymentCompletionResult> => ({ success: true, transactionId: 'ww-r1' }));
    const session = createIapSession({ products: PRODUCTS, validate });
    await session.init();

    await expect(session.restorePurchases()).resolves.toEqual({ restored: 1, transactionId: 'ww-r1' });
    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledWith({
      providerType: 10,
      productId: 'com.app.pro.monthly',
      purchaseToken: 'jws-restored',
      transactionId: 'store-txn-9',
      isRestore: true,
    });
  });

  it('removes its listeners and closes the store connection on dispose', async () => {
    const store = createStoreDouble();
    vi.doMock('expo-iap', () => store.mod);
    const createIapSession = await loadSession();

    const session = createIapSession({ products: PRODUCTS, validate: vi.fn() });
    await session.init();
    await session.dispose();

    expect(store.removed).toEqual(['purchase', 'error']);
    expect(store.mod.endConnection).toHaveBeenCalledTimes(1);
  });
});
