// Lazy Stripe.js access.
//
// Node-safe: the module holds nothing but a cache at load time, and the browser is only touched
// inside getStripeInstance(). The interfaces below are deliberately the smallest surface the SDK
// uses, so React components and tests never have to depend on Stripe's own types.

import { WildwoodError } from '../client/errors.js';
import { loadStripe } from './scriptLoader.js';

/** One mounted Stripe Element (a card field, a payment element, ...). */
export interface StripeElementLike {
  mount(target: string | Element): void;
  unmount(): void;
  destroy(): void;
  on(event: string, handler: (event: unknown) => void): void;
  update?(options: Record<string, unknown>): void;
  clear?(): void;
}

/** The Elements group a card form is built from. */
export interface StripeElementsLike {
  create(type: string, options?: Record<string, unknown>): StripeElementLike;
  getElement(type: string): StripeElementLike | null;
}

/** What a confirm/retrieve call answers. Fields absent on the wire stay undefined here. */
export interface StripeConfirmResult {
  error?: {
    type?: string;
    code?: string;
    message?: string;
    decline_code?: string;
  };
  paymentIntent?: {
    id: string;
    status: string;
    client_secret?: string;
  };
  setupIntent?: {
    id: string;
    status: string;
    client_secret?: string;
    payment_method?: string | { id: string };
  };
}

/** The slice of the Stripe.js instance this SDK calls. */
export interface StripeLike {
  elements(options?: Record<string, unknown>): StripeElementsLike;
  confirmCardPayment(clientSecret: string, options?: Record<string, unknown>): Promise<StripeConfirmResult>;
  confirmCardSetup(clientSecret: string, options?: Record<string, unknown>): Promise<StripeConfirmResult>;
  retrievePaymentIntent(clientSecret: string): Promise<StripeConfirmResult>;
  retrieveSetupIntent(clientSecret: string): Promise<StripeConfirmResult>;
}

type StripeFactory = (publishableKey: string) => StripeLike;

/**
 * One instance per publishable key. A company with two Stripe accounts has two sets of customers
 * and cards, so the key is the identity — keyed on anything coarser and a card collected for one
 * account would be confirmed against the other.
 */
const instances = new Map<string, Promise<StripeLike>>();

function browserError(message: string): WildwoodError {
  // status 0: nothing was ever sent, so there is no HTTP status to report.
  return new WildwoodError(message, 0, 'Unknown');
}

/**
 * The Stripe.js instance for a publishable key, loading the script on first use.
 *
 * Cached per key: a second call returns the very same promise, so a page with several card forms
 * loads Stripe once. A failed load is evicted, so a retry can succeed. Rejects with a
 * {@link WildwoodError} outside a browser — Stripe.js has no server-side form, and callers must
 * be able to tell that apart from a network failure.
 */
export function getStripeInstance(publishableKey: string): Promise<StripeLike> {
  const key = publishableKey?.trim();
  if (!key) {
    return Promise.reject(browserError('A Stripe publishable key is required'));
  }

  if (typeof window === 'undefined') {
    return Promise.reject(browserError('Stripe.js is only available in the browser'));
  }

  const existing = instances.get(key);
  if (existing) return existing;

  const instance = loadStripe()
    .then(() => {
      const factory = (window as unknown as { Stripe?: StripeFactory }).Stripe;
      if (typeof factory !== 'function') {
        throw browserError('Stripe.js loaded but window.Stripe is unavailable');
      }
      return factory(key);
    })
    .catch((err: unknown) => {
      instances.delete(key);
      throw err instanceof WildwoodError ? err : browserError(err instanceof Error ? err.message : String(err));
    });

  instances.set(key, instance);
  return instance;
}

/** Forget every cached instance. For tests, and for a page that swaps publishable keys. */
export function resetStripeInstanceCache(): void {
  instances.clear();
}
