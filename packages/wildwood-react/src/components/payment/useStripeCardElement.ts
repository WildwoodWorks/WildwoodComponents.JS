'use client';

// One mounted Stripe card field, shared by every surface that collects a card.
//
// Lifted out of PaymentComponent unchanged in behaviour: load Stripe.js, create a card Element
// styled from the theme's CSS variables, mount it as soon as the container is in the DOM, follow
// its `change` events, and destroy it on the way out. The pack checkout's card step needs exactly
// the same thing, and two copies of this would drift.
//
// Nothing here runs at module scope, so importing it on a server is safe; every browser call
// happens inside the effect.

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { loadStripe } from '@wildwood/core';

/** What a card Element reports as the customer types. */
export interface StripeCardEvent {
  complete: boolean;
  error?: { message: string };
  empty: boolean;
}

/** One mounted card Element. */
export interface StripeCardElement {
  mount: (domElement: string | HTMLElement) => void;
  unmount: () => void;
  destroy: () => void;
  on: (event: string, handler: (e: StripeCardEvent) => void) => void;
}

export interface StripeElements {
  create: (type: 'card', options?: Record<string, unknown>) => StripeCardElement;
}

/** The slice of Stripe.js these components call. */
export interface StripeInstance {
  elements: (options?: Record<string, unknown>) => StripeElements;
  confirmCardPayment: (
    clientSecret: string,
    data?: { payment_method: { card: StripeCardElement } },
  ) => Promise<{
    paymentIntent?: { id: string; status: string };
    error?: { message: string; code?: string };
  }>;
  confirmCardSetup: (
    clientSecret: string,
    data?: { payment_method: { card: StripeCardElement } },
  ) => Promise<{
    setupIntent?: { id: string; status: string };
    error?: { message: string; code?: string };
  }>;
  /** Only used to read back an intent the bank has just authenticated. Older stubs may not have it. */
  retrievePaymentIntent?: (clientSecret: string) => Promise<{
    paymentIntent?: { id: string; status: string };
    error?: { message: string; code?: string };
  }>;
}

declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeInstance;
  }
}

/** How long the card waits for its container to reach the DOM (50 frames, roughly 800ms). */
const MAX_MOUNT_ATTEMPTS = 50;

/**
 * Load Stripe.js and build an instance for one publishable key.
 *
 * The script itself is deduplicated by `loadStripe`, so several card forms on a page load it once.
 * Rejects rather than returning null when Stripe.js is unavailable, so a caller cannot mistake
 * "not loaded" for "no card needed".
 */
export async function createStripeInstance(publishableKey: string): Promise<StripeInstance> {
  await loadStripe();
  if (!window.Stripe) {
    throw new Error('Failed to load Stripe. Please refresh and try again.');
  }
  return window.Stripe(publishableKey);
}

/** The card Element's styling, read from the theme rather than hard-coded. */
function cardElementStyle(): Record<string, unknown> {
  const themeValue = (name: string, fallback: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  return {
    base: {
      fontSize: '16px',
      color: themeValue('--ww-text-primary', '#32325d'),
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      '::placeholder': {
        color: themeValue('--ww-text-muted', '#aab7c4'),
      },
    },
    invalid: {
      color: themeValue('--ww-danger', '#dc3545'),
      iconColor: themeValue('--ww-danger', '#dc3545'),
    },
  };
}

export interface UseStripeCardElementOptions {
  /** The Stripe account to collect the card for. Nothing loads until there is one. */
  publishableKey?: string;
  /** Set false to hold the load back (a non-Stripe provider is selected). Defaults to true. */
  enabled?: boolean;
}

export interface UseStripeCardElementReturn {
  /** The Stripe.js instance, once loaded. */
  stripe: StripeInstance | null;
  /** The mounted card Element, to hand to `confirmCardPayment` / `confirmCardSetup`. */
  cardElement: StripeCardElement | null;
  /** Attach to the element the card field should be mounted into. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The field is mounted and usable. */
  ready: boolean;
  loading: boolean;
  /** Why the card form could not be shown at all. */
  error: string | null;
  /** The customer has entered a complete card. */
  cardComplete: boolean;
  /** The field's own validation message. */
  cardError: string | null;
}

/**
 * Mount a Stripe card field into `containerRef`.
 *
 * One field per hook: the Element is created when the key arrives and destroyed when the key
 * changes or the component unmounts, so a page that switches Stripe accounts never confirms a card
 * against the account it was not collected for.
 */
export function useStripeCardElement({
  publishableKey,
  enabled = true,
}: UseStripeCardElementOptions): UseStripeCardElementReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stripe, setStripe] = useState<StripeInstance | null>(null);
  const [cardElement, setCardElement] = useState<StripeCardElement | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !publishableKey) return;

    let cancelled = false;
    let card: StripeCardElement | null = null;

    const init = async () => {
      setLoading(true);
      setError(null);
      setReady(false);

      try {
        const instance = await createStripeInstance(publishableKey);
        if (cancelled) return;
        setStripe(instance);

        card = instance.elements().create('card', { style: cardElementStyle() });
        setCardElement(card);

        card.on('change', (event: StripeCardEvent) => {
          setCardComplete(event.complete);
          setCardError(event.error?.message ?? null);
        });

        // The container belongs to the caller's markup, which may not be painted yet.
        let attempts = 0;
        const mountCard = () => {
          if (cancelled) return;
          if (containerRef.current) {
            card?.mount(containerRef.current);
            setReady(true);
          } else if (attempts < MAX_MOUNT_ATTEMPTS) {
            attempts += 1;
            requestAnimationFrame(mountCard);
          } else {
            setError('Card form container not found. Please refresh and try again.');
          }
        };
        mountCard();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to initialize payment form.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void init();

    return () => {
      cancelled = true;
      if (card) {
        try {
          card.destroy();
        } catch {
          // element may already be destroyed
        }
      }
      setCardElement(null);
      setStripe(null);
      setReady(false);
      setCardComplete(false);
      setCardError(null);
    };
  }, [enabled, publishableKey]);

  return { stripe, cardElement, containerRef, ready, loading, error, cardComplete, cardError };
}
