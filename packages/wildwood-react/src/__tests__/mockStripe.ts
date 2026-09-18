/**
 * A `window.Stripe` stub for the card-collecting surfaces.
 *
 * Stripe.js is never loaded in a test: the suites that need a card mock `loadStripe` and install
 * this, so the components take exactly the path they take in a browser — create an Element, mount
 * it, follow its `change` events, confirm an intent — against calls this file records.
 */
import { vi, type Mock } from 'vitest';
import type { StripeCardElement, StripeCardEvent, StripeInstance } from '../components/payment/useStripeCardElement.js';

/** One card Element the stub handed out, with the handlers it was given. */
export interface MockStripeCard extends StripeCardElement {
  mount: Mock<(target: string | HTMLElement) => void>;
  unmount: Mock<() => void>;
  destroy: Mock<() => void>;
  /** Fire the field's `change` event, as typing into it would. */
  emitChange: (event: Partial<StripeCardEvent>) => void;
  /** Where `mount` was called, or null while the field is not mounted. */
  mountedIn: () => string | HTMLElement | null;
}

export interface MockStripe {
  /** `window.Stripe` itself, so a test can count how often an instance was built. */
  factory: Mock<(publishableKey: string) => StripeInstance>;
  /** Every card Element created, oldest first. */
  cards: MockStripeCard[];
  /** The most recent card Element. Throws when none has been created yet. */
  lastCard: () => MockStripeCard;
  confirmCardSetup: Mock;
  confirmCardPayment: Mock;
  retrievePaymentIntent: Mock;
  /** Remove the stub from `window`. */
  uninstall: () => void;
}

function createCard(cards: MockStripeCard[]): MockStripeCard {
  let handler: ((event: StripeCardEvent) => void) | undefined;
  let target: string | HTMLElement | null = null;

  const card: MockStripeCard = {
    mount: vi.fn((where: string | HTMLElement) => {
      target = where;
    }),
    unmount: vi.fn(() => {
      target = null;
    }),
    destroy: vi.fn(() => {
      target = null;
    }),
    on: (event: string, next: (e: StripeCardEvent) => void) => {
      if (event === 'change') handler = next;
    },
    emitChange: (event: Partial<StripeCardEvent>) => {
      handler?.({ complete: false, empty: true, ...event });
    },
    mountedIn: () => target,
  };

  cards.push(card);
  return card;
}

/**
 * Install the stub on `window.Stripe`. Call `uninstall()` (or install a fresh one) between tests —
 * the components cache nothing across mounts, so a new stub is a clean slate.
 */
export function installMockStripe(): MockStripe {
  const cards: MockStripeCard[] = [];
  const confirmCardSetup = vi.fn().mockResolvedValue({ setupIntent: { id: 'seti_test', status: 'succeeded' } });
  const confirmCardPayment = vi.fn().mockResolvedValue({ paymentIntent: { id: 'pi_test', status: 'succeeded' } });
  const retrievePaymentIntent = vi.fn().mockResolvedValue({ paymentIntent: { id: 'pi_test', status: 'succeeded' } });

  const factory = vi.fn((_publishableKey: string) => ({
    elements: () => ({ create: () => createCard(cards) }),
    confirmCardSetup,
    confirmCardPayment,
    retrievePaymentIntent,
  })) as unknown as Mock<(publishableKey: string) => StripeInstance>;

  window.Stripe = factory as unknown as Window['Stripe'];

  return {
    factory,
    cards,
    lastCard: () => {
      const card = cards[cards.length - 1];
      if (!card) throw new Error('no Stripe card element has been created');
      return card;
    },
    confirmCardSetup,
    confirmCardPayment,
    retrievePaymentIntent,
    uninstall: () => {
      delete window.Stripe;
    },
  };
}
