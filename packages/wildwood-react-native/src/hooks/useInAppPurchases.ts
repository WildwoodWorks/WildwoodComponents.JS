import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { PaymentProviderType } from '@wildwood/core';
import type { IapProductMapping, PaymentCompletionResult, StoreProviderType, StorePurchase } from '@wildwood/core';
import { usePayment } from './usePayment';

/* ------------------------------------------------------------------------------------------------
 * Public types
 * ---------------------------------------------------------------------------------------------- */

export type IapPurchaseState = 'idle' | 'purchasing' | 'validating' | 'pending' | 'success' | 'failed';

export interface UseInAppPurchasesOptions {
  products: IapProductMapping[];
  /** Override the receipt hand-off (e.g. while server validation is pending). Default: client.payment.validateStorePurchase. */
  onValidatePurchase?: (purchase: StorePurchase) => Promise<PaymentCompletionResult>;
}

/** An {@link IapProductMapping} merged with whatever metadata the store returned for it. */
export interface IapDisplayProduct extends IapProductMapping {
  localizedPrice?: string;
  title?: string;
  description?: string;
}

export interface UseInAppPurchasesReturn {
  /** expo-iap is installed AND a store connection was established. */
  available: boolean;
  /** The configured mapping, merged with store metadata once the store answers. */
  products: IapDisplayProduct[];
  purchaseState: IapPurchaseState;
  error: string | null;
  /**
   * Buys the product mapped to `tierId` (+ `pricingId`) and validates the receipt with Wildwood.
   * Resolves the Wildwood payment transaction id — pass it as `paymentTransactionId` to
   * `useAppTier`'s changeTier / selfSubscribe. Resolves `null` when the shopper cancelled, when the
   * purchase is deferred (Ask to Buy), when IAP is unavailable, or when validation failed; read
   * `purchaseState` / `error` to tell those apart. Rejects only when a purchase is already running.
   */
  purchaseTier: (tierId: string, pricingId?: string) => Promise<string | null>;
  /** Re-validates the shopper's existing entitlements. Required by App Store review. */
  restorePurchases: () => Promise<{ restored: number; transactionId?: string; error?: string }>;
}

/* ------------------------------------------------------------------------------------------------
 * expo-iap loading — optional, lazy, never a static top-level import
 * ---------------------------------------------------------------------------------------------- */

export const IAP_NOT_INSTALLED_MESSAGE =
  'In-app purchases are unavailable: expo-iap is not installed. Run `npx expo install expo-iap` and rebuild the native app.';

const STORE_UNAVAILABLE_MESSAGE = 'In-app purchases are unavailable: could not connect to the store.';

const IAP_FEATURE_MISSING_MESSAGE =
  'In-app purchases are unavailable: the installed expo-iap version does not expose the purchase API this SDK needs. Upgrade expo-iap.';

/** expo-iap's surface differs across versions, so it is consumed as a bag of maybe-functions. */
type IapModule = Record<string, unknown>;
type AnyFn = (...args: never[]) => unknown;
type StoreRecord = Record<string, unknown>;

// `declare` only — this emits nothing, it just types Metro's module-scoped require.
declare const require: ((id: string) => unknown) | undefined;

/**
 * Loads expo-iap without ever making the app depend on it.
 *
 * Both calls are deliberately inside try/catch AND deliberately use a literal specifier. Metro marks
 * a dependency inside a try block as OPTIONAL, so an app that never touches IAP neither installs
 * expo-iap nor needs a native rebuild — but only a literal specifier is statically analysable;
 * `import(someVariable)` is a hard Metro BUILD error, not a runtime one. `require` comes first
 * because it is the form Metro's optional-dependency handling is built around; the dynamic import
 * covers runtimes where `require` is not a free variable.
 *
 * The `@ts-expect-error`s are load-bearing: expo-iap is intentionally not installed in this
 * package, so TypeScript cannot resolve it. They will start failing loudly if it ever is.
 */
async function loadIapModule(): Promise<IapModule | null> {
  try {
    if (typeof require === 'function') {
      const required = require('expo-iap') as IapModule | undefined;
      if (required) return unwrap(required);
    }
  } catch {
    /* not installed under this bundler — fall through to the dynamic import */
  }
  try {
    // @ts-ignore -- optional peer: resolves when the consumer installs expo-iap, errors when absent; ts-ignore tolerates both states where ts-expect-error cannot
    const imported = (await import('expo-iap')) as IapModule;
    return imported ? unwrap(imported) : null;
  } catch {
    return null;
  }
}

/**
 * Reads one export off the module. Guarded because a module namespace is not always a plain object:
 * some interop wrappers (and Vitest's mock proxies) THROW on a member that does not exist, which
 * would otherwise turn "this expo-iap version does not have that function" into "expo-iap failed".
 */
function member(mod: IapModule, name: string): unknown {
  try {
    return mod[name];
  } catch {
    return undefined;
  }
}

/** Interop: some bundlers hand back `{ default: module }` for expo-iap's CJS build. */
function unwrap(mod: IapModule): IapModule {
  const inner = member(mod, 'default') as IapModule | undefined;
  if (inner && typeof inner === 'object' && typeof member(mod, 'initConnection') !== 'function') {
    try {
      // Named re-exports win over the default bag when a bundler provides both.
      return { ...inner, ...mod };
    } catch {
      return inner;
    }
  }
  return mod;
}

/** First member of `names` that expo-iap actually exports as a function. */
function pick(mod: IapModule, ...names: string[]): AnyFn | null {
  for (const name of names) {
    const candidate = member(mod, name);
    if (typeof candidate === 'function') return candidate as AnyFn;
  }
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * Field extraction — expo-iap renamed several purchase/product fields between versions
 * ---------------------------------------------------------------------------------------------- */

function str(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function firstOf(record: StoreRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = str(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** iOS: the StoreKit 2 signed JWS. Android: Play Billing's purchaseToken. */
function extractPurchaseToken(purchase: StoreRecord): string | undefined {
  return firstOf(
    purchase,
    'purchaseToken',
    'purchaseTokenAndroid',
    'jwsRepresentationIos',
    'jwsRepresentationIOS',
    'jwsRepresentation',
    'transactionReceipt',
  );
}

function extractProductId(purchase: StoreRecord): string | undefined {
  const direct = firstOf(purchase, 'productId', 'productIdAndroid', 'sku');
  if (direct) return direct;
  for (const key of ['ids', 'productIds', 'skus']) {
    const list = purchase[key];
    if (Array.isArray(list)) {
      const first = str(list[0]);
      if (first) return first;
    }
  }
  return undefined;
}

/** The STORE's transaction id (not Wildwood's). `id` is expo-iap 2.7+'s name for it. */
function extractStoreTransactionId(purchase: StoreRecord): string | undefined {
  return firstOf(purchase, 'transactionId', 'transactionIdIos', 'transactionIdIOS', 'id', 'orderId');
}

/** Android PENDING purchases (and iOS deferred ones) must not be finished or validated yet. */
function isPendingPurchase(purchase: StoreRecord): boolean {
  if (purchase.purchaseStateAndroid === 2 || purchase.purchaseState === 2) return true;
  const state = str(purchase.purchaseState) ?? str(purchase.purchaseStateAndroid);
  return state !== undefined && normalizeCode(state).includes('pending');
}

function normalizeCode(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Matches E_USER_CANCELLED, 'user-cancelled', 'UserCanceled', … across expo-iap versions. */
function isUserCancelled(code: unknown): boolean {
  const normalized = normalizeCode(code);
  return normalized.includes('usercancel');
}

function isDeferred(code: unknown): boolean {
  return normalizeCode(code).includes('deferred');
}

/* ------------------------------------------------------------------------------------------------
 * The store session — the whole store conversation, with no React in it.
 *
 * Keeping this a plain object (the hook is a thin subscription over it) is what makes the purchase
 * state machine testable without a React renderer, which this package has no dependency on.
 * ---------------------------------------------------------------------------------------------- */

export interface IapSessionState {
  available: boolean;
  products: IapDisplayProduct[];
  purchaseState: IapPurchaseState;
  error: string | null;
}

export interface IapSessionOptions {
  products: IapProductMapping[];
  validate: (purchase: StorePurchase) => Promise<PaymentCompletionResult>;
}

export interface IapSession {
  getState(): IapSessionState;
  subscribe(listener: () => void): () => void;
  init(): Promise<void>;
  purchaseTier(tierId: string, pricingId?: string): Promise<string | null>;
  restorePurchases(): Promise<{ restored: number; transactionId?: string; error?: string }>;
  dispose(): Promise<void>;
}

function storeProviderType(): StoreProviderType {
  return Platform.OS === 'android' ? PaymentProviderType.GooglePlayStore : PaymentProviderType.AppleAppStore;
}

interface InFlightPurchase {
  productId: string;
  settle: (transactionId: string | null) => void;
}

/**
 * @internal Exported for tests. Consumers use {@link useInAppPurchases}.
 */
export function createIapSession(options: IapSessionOptions): IapSession {
  const mappings = options.products;

  let state: IapSessionState = {
    available: false,
    // Show the configured mapping immediately; store metadata is merged in when it arrives.
    products: mappings.map((m) => ({ ...m })),
    purchaseState: 'idle',
    error: null,
  };

  const listeners = new Set<() => void>();
  let mod: IapModule | null = null;
  let initPromise: Promise<void> | null = null;
  let disposed = false;
  let subscriptions: Array<{ remove?: () => void }> = [];
  let inFlight: InFlightPurchase | null = null;
  let busy = false;
  /** Store transaction ids already handled, so a listener event and a resolved requestPurchase
      for the same purchase are not processed twice. */
  const handled = new Set<string>();
  /** Product metadata keyed by store product id. */
  let storeProducts = new Map<string, StoreRecord>();

  function emit() {
    for (const listener of listeners) listener();
  }

  function setState(patch: Partial<IapSessionState>) {
    state = { ...state, ...patch };
    emit();
  }

  function mergeProducts() {
    setState({
      products: mappings.map((m) => {
        const p = storeProducts.get(m.productId);
        if (!p) return { ...m };
        return {
          ...m,
          localizedPrice: firstOf(p, 'displayPrice', 'localizedPrice', 'price'),
          title: firstOf(p, 'title', 'displayName', 'name'),
          description: firstOf(p, 'description'),
        };
      }),
    });
  }

  function findMapping(tierId: string, pricingId?: string): IapProductMapping | undefined {
    if (pricingId) {
      const exact = mappings.find((m) => m.tierId === tierId && m.pricingId === pricingId);
      if (exact) return exact;
    }
    return mappings.find((m) => m.tierId === tierId && (pricingId === undefined || m.pricingId === undefined));
  }

  async function fetchStoreProducts() {
    if (!mod || mappings.length === 0) return;
    const skus = [...new Set(mappings.map((m) => m.productId))];
    // expo-iap 2.7+ `fetchProducts`, 2.x `requestProducts`, 1.x `getProducts`.
    const fetch = pick(mod, 'fetchProducts', 'requestProducts', 'getProducts');
    if (!fetch) return;
    let raw: unknown;
    try {
      raw = await (fetch as (arg: unknown) => unknown)({ skus, type: 'all' });
    } catch {
      try {
        // The 1.x signature takes the sku array positionally.
        raw = await (fetch as (arg: unknown) => unknown)(skus);
      } catch {
        return;
      }
    }
    const list: StoreRecord[] = [];
    const collect = (value: unknown) => {
      if (Array.isArray(value)) list.push(...(value as StoreRecord[]));
    };
    if (Array.isArray(raw)) {
      collect(raw);
    } else if (raw && typeof raw === 'object') {
      const bag = raw as StoreRecord;
      collect(bag.products);
      collect(bag.subscriptions);
    }
    const next = new Map<string, StoreRecord>();
    for (const product of list) {
      const id = firstOf(product, 'id', 'productId', 'sku');
      if (id) next.set(id, product);
    }
    storeProducts = next;
    mergeProducts();
  }

  function settle(transactionId: string | null) {
    const current = inFlight;
    inFlight = null;
    busy = false;
    current?.settle(transactionId);
  }

  async function finish(purchase: StoreRecord) {
    if (!mod) return;
    const finishTransaction = pick(mod, 'finishTransaction');
    if (!finishTransaction) return;
    try {
      await (finishTransaction as (arg: unknown) => unknown)({ purchase, isConsumable: false });
    } catch {
      // Already-finished transactions throw on some versions; the entitlement is granted either way.
    }
  }

  type PurchaseOutcome =
    | { kind: 'ignored' }
    | { kind: 'pending' }
    | { kind: 'failed'; message: string }
    | { kind: 'validated'; transactionId: string | null };

  /**
   * Turns one store purchase into a validated Wildwood transaction. Shared by the purchase listener
   * and the restore sweep; only the purchase flow settles the in-flight promise and drives state.
   */
  async function processPurchase(raw: unknown, isRestore: boolean): Promise<PurchaseOutcome> {
    if (!raw || typeof raw !== 'object') return { kind: 'ignored' };
    const purchase = raw as StoreRecord;
    const productId = extractProductId(purchase);
    if (!productId) return { kind: 'ignored' };
    const mapping = mappings.find((m) => m.productId === productId);
    // A product this app did not map (or another library's purchase) is not ours to finish.
    if (!mapping) return { kind: 'ignored' };

    const storeTransactionId = extractStoreTransactionId(purchase);
    if (!isRestore) {
      // requestPurchase may resolve with the same purchase the listener already delivered.
      const dedupeKey = storeTransactionId ?? extractPurchaseToken(purchase) ?? productId;
      if (handled.has(dedupeKey)) return { kind: 'ignored' };
      handled.add(dedupeKey);
    }

    // Ask to Buy / slow card: the store will deliver it later. Do NOT finish or validate.
    if (isPendingPurchase(purchase)) return { kind: 'pending' };

    const purchaseToken = extractPurchaseToken(purchase);
    if (!purchaseToken) {
      return { kind: 'failed', message: 'The store returned a purchase with no receipt to validate.' };
    }

    if (!isRestore) setState({ purchaseState: 'validating', error: null });

    const storePurchase: StorePurchase = {
      providerType: storeProviderType(),
      productId,
      purchaseToken,
      ...(storeTransactionId !== undefined ? { transactionId: storeTransactionId } : {}),
      ...(isRestore ? { isRestore: true } : {}),
    };

    let result: PaymentCompletionResult;
    try {
      result = await options.validate(storePurchase);
    } catch (err) {
      // An unvalidated purchase must stay UNFINISHED so the store re-delivers it next launch.
      return { kind: 'failed', message: err instanceof Error ? err.message : 'Could not validate the purchase.' };
    }
    if (!result.success) {
      return { kind: 'failed', message: result.errorMessage ?? 'The store purchase could not be validated.' };
    }

    // Only now — the entitlement is recorded server-side, so the store can stop re-delivering it.
    await finish(purchase);
    return { kind: 'validated', transactionId: result.transactionId ?? null };
  }

  /** The purchase-flow wrapper: drives purchaseState and settles the pending purchaseTier promise. */
  async function handlePurchaseEvent(raw: unknown): Promise<void> {
    const outcome = await processPurchase(raw, false);
    switch (outcome.kind) {
      case 'ignored':
        return;
      case 'pending':
        setState({ purchaseState: 'pending', error: null });
        settle(null);
        return;
      case 'failed':
        setState({ purchaseState: 'failed', error: outcome.message });
        settle(null);
        return;
      case 'validated':
        setState({ purchaseState: 'success', error: null });
        settle(outcome.transactionId);
        return;
    }
  }

  function handlePurchaseError(error: unknown) {
    const bag = (error ?? {}) as StoreRecord;
    const code = bag.code ?? bag.responseCode ?? bag.message;
    if (isUserCancelled(code)) {
      // Cancelling is not an error the shopper needs told about.
      setState({ purchaseState: 'idle', error: null });
      settle(null);
      return;
    }
    if (isDeferred(code)) {
      setState({ purchaseState: 'pending', error: null });
      settle(null);
      return;
    }
    const message =
      str(bag.message) ??
      (error instanceof Error ? error.message : undefined) ??
      'The purchase could not be completed.';
    setState({ purchaseState: 'failed', error: message });
    settle(null);
  }

  async function doInit() {
    const loaded = await loadIapModule();
    if (disposed) return;
    if (!loaded) {
      // Not installed: stay inert and silent until the app actually attempts a purchase.
      setState({ available: false });
      return;
    }
    mod = loaded;
    try {
      const initConnection = pick(mod, 'initConnection');
      if (initConnection) {
        const connected = await (initConnection as () => unknown)();
        if (connected === false) throw new Error(STORE_UNAVAILABLE_MESSAGE);
      }
      if (disposed) return;

      const onUpdated = pick(mod, 'purchaseUpdatedListener');
      if (onUpdated) {
        subscriptions.push(
          (onUpdated as (cb: (p: unknown) => void) => { remove?: () => void })((p) => {
            void handlePurchaseEvent(p);
          }),
        );
      }
      const onError = pick(mod, 'purchaseErrorListener');
      if (onError) {
        subscriptions.push(
          (onError as (cb: (e: unknown) => void) => { remove?: () => void })((e) => {
            handlePurchaseError(e);
          }),
        );
      }
      setState({ available: true });
      await fetchStoreProducts();
    } catch {
      mod = null;
      setState({ available: false });
    }
  }

  function ready(): Promise<void> {
    initPromise ??= doInit();
    return initPromise;
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    init: ready,

    async purchaseTier(tierId, pricingId) {
      await ready();
      if (!mod || !state.available) {
        setState({ purchaseState: 'failed', error: IAP_NOT_INSTALLED_MESSAGE });
        return null;
      }
      const mapping = findMapping(tierId, pricingId);
      if (!mapping) {
        setState({
          purchaseState: 'failed',
          error: `No store product is mapped to tier "${tierId}"${pricingId ? ` (pricing "${pricingId}")` : ''}.`,
        });
        return null;
      }
      if (busy) {
        // One store conversation at a time — StoreKit/Play do not queue ours for us.
        throw new Error('A purchase is already in progress.');
      }
      const requestPurchase = pick(mod, 'requestPurchase');
      if (!requestPurchase) {
        setState({ purchaseState: 'failed', error: IAP_FEATURE_MISSING_MESSAGE });
        return null;
      }

      busy = true;
      setState({ purchaseState: 'purchasing', error: null });

      const settled = new Promise<string | null>((resolve) => {
        inFlight = { productId: mapping.productId, settle: resolve };
      });

      const product = storeProducts.get(mapping.productId);
      const productType = normalizeCode(product?.type).startsWith('sub') ? 'subs' : 'in-app';
      // expo-iap 2.7+ takes a platform-split `request` bag; older versions take sku/skus directly.
      // Presence of fetchProducts/requestProducts is the version tell — cheaper and safer than
      // attempting a purchase twice to find out.
      const modern = pick(mod, 'fetchProducts', 'requestProducts') !== null;
      const payload = modern
        ? {
            request: {
              ios: { sku: mapping.productId },
              android: { skus: [mapping.productId] },
            },
            type: productType,
          }
        : { sku: mapping.productId, skus: [mapping.productId], type: productType };

      try {
        // Some versions resolve requestPurchase with the purchase itself instead of (or as well as)
        // emitting it to the listener; handlePurchase dedupes so either shape works.
        const immediate = await (requestPurchase as (arg: unknown) => unknown)(payload);
        if (Array.isArray(immediate)) {
          for (const p of immediate) void handlePurchaseEvent(p);
        } else if (immediate && typeof immediate === 'object') {
          void handlePurchaseEvent(immediate);
        }
      } catch (err) {
        handlePurchaseError(err);
      }

      return settled;
    },

    async restorePurchases() {
      await ready();
      if (!mod || !state.available) {
        return { restored: 0, error: IAP_NOT_INSTALLED_MESSAGE };
      }
      if (busy) {
        return { restored: 0, error: 'A purchase is already in progress.' };
      }
      const getAvailablePurchases = pick(mod, 'getAvailablePurchases', 'getPurchaseHistories', 'getPurchaseHistory');
      if (!getAvailablePurchases) {
        return { restored: 0, error: 'This version of expo-iap cannot list existing purchases.' };
      }

      busy = true;
      setState({ purchaseState: 'validating', error: null });
      try {
        const raw = await (getAvailablePurchases as () => unknown)();
        const list = Array.isArray(raw) ? (raw as StoreRecord[]) : [];
        let restored = 0;
        let transactionId: string | undefined;
        let lastError: string | undefined;
        for (const purchase of list) {
          const outcome = await processPurchase(purchase, true);
          if (outcome.kind === 'validated') {
            restored += 1;
            transactionId = outcome.transactionId ?? transactionId;
          } else if (outcome.kind === 'failed') {
            // One bad receipt must not abandon the rest of the shopper's entitlements.
            lastError = outcome.message;
          }
        }
        setState({
          purchaseState: restored > 0 ? 'success' : lastError ? 'failed' : 'idle',
          error: restored > 0 ? null : (lastError ?? null),
        });
        return {
          restored,
          ...(transactionId !== undefined ? { transactionId } : {}),
          ...(restored === 0 && lastError ? { error: lastError } : {}),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not restore purchases.';
        setState({ purchaseState: 'failed', error: message });
        return { restored: 0, error: message };
      } finally {
        busy = false;
      }
    },

    async dispose() {
      disposed = true;
      // Never leave a caller awaiting a promise that can no longer be settled.
      settle(null);
      for (const sub of subscriptions) sub?.remove?.();
      subscriptions = [];
      listeners.clear();
      const current = mod;
      mod = null;
      if (current) {
        const endConnection = pick(current, 'endConnection');
        try {
          await (endConnection as (() => unknown) | null)?.();
        } catch {
          /* tearing down a connection that is already gone is not worth surfacing */
        }
      }
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * The hook
 * ---------------------------------------------------------------------------------------------- */

/**
 * In-app purchases for a Wildwood tier, over expo-iap.
 *
 * expo-iap is an OPTIONAL peer dependency loaded lazily: an app that never calls this hook does not
 * need the package installed and does not need a native prebuild. When it is missing, `available`
 * is false and every call is inert.
 *
 * The receipt is validated server-side (`payment.validateStorePurchase`) and the transaction is only
 * finished once Wildwood has recorded it — an unvalidated purchase stays unfinished so the store
 * re-delivers it on the next launch.
 */
export function useInAppPurchases(options: UseInAppPurchasesOptions): UseInAppPurchasesReturn {
  const { products, onValidatePurchase } = options;
  const { validateStorePurchase } = usePayment();

  // The session reads validation through a ref so a new inline callback each render does not tear
  // down the store connection.
  const validateRef = useRef<(purchase: StorePurchase) => Promise<PaymentCompletionResult>>(validateStorePurchase);
  validateRef.current = onValidatePurchase ?? validateStorePurchase;

  // Mappings are usually an inline literal, so key the session on the mapping's content, not its
  // identity — otherwise every parent render would rebuild the store connection.
  const productsKey = JSON.stringify(products.map((p) => [p.productId, p.tierId, p.pricingId ?? null]));
  const session = useMemo(
    () =>
      createIapSession({
        products: JSON.parse(productsKey).map(([productId, tierId, pricingId]: [string, string, string | null]) => ({
          productId,
          tierId,
          ...(pricingId !== null ? { pricingId } : {}),
        })),
        validate: (purchase) => validateRef.current(purchase),
      }),
    [productsKey],
  );

  const [state, setState] = useState<IapSessionState>(() => session.getState());

  useEffect(() => {
    setState(session.getState());
    const unsubscribe = session.subscribe(() => setState(session.getState()));
    void session.init();
    return () => {
      unsubscribe();
      void session.dispose();
    };
  }, [session]);

  const purchaseTier = useCallback(
    (tierId: string, pricingId?: string) => session.purchaseTier(tierId, pricingId),
    [session],
  );
  const restorePurchases = useCallback(() => session.restorePurchases(), [session]);

  return {
    available: state.available,
    products: state.products,
    purchaseState: state.purchaseState,
    error: state.error,
    purchaseTier,
    restorePurchases,
  };
}
