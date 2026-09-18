// Buying any number of packs against one card, as a pure reducer.
//
//   idle -> quoting -> quoted -> [collectingCard] -> checkingOut
//        -> authenticating -> completing -> (next item) -> done
//
// The server prices the basket (`quoteAddOnCheckout`), the customer's card is collected once when
// there is none on file, the basket is bought in one call, and then any pack the bank wants
// authenticated is walked ONE AT A TIME, in order: confirm its `clientSecret`, complete it on the
// server, move to the next. One pack failing never stops the others — a basket is a basket, not a
// transaction — so read `results` per pack rather than a single success flag.
//
// Async steps carry a {@link StepToken}: a doubled effect or a payment callback that fires twice
// cannot buy anything twice or skip a pack.

import type {
  AddOnCheckoutItemInput,
  AddOnCheckoutItemResultModel,
  AddOnCheckoutQuoteModel,
  AddOnCheckoutResultModel,
} from '@wildwood/core';
import { issueStepToken, isCurrentStep, type StepToken } from './stepTokens.js';

export type PackCheckoutStep =
  | 'idle'
  | 'quoting'
  | 'quoted'
  | 'collectingCard'
  | 'checkingOut'
  | 'authenticating'
  | 'completing'
  | 'done'
  | 'failed';

export interface PackCheckoutState {
  step: PackCheckoutStep;
  /** The async step in flight, or `null`. Results carrying another token are ignored. */
  token: StepToken | null;

  appId: string;
  items: AddOnCheckoutItemInput[];
  quote: AddOnCheckoutQuoteModel | null;

  /** The SetupIntent secret the card form confirms, while a card is being collected. */
  cardClientSecret?: string;
  /** The card, once collected — handed to the purchase so it reads the saved card off it. */
  paymentTransactionId?: string;
  /** Whether the purchase should charge the card already on file. */
  useSavedCard: boolean;

  /** One entry per requested pack, updated in place as each one is authenticated and completed. */
  results: AddOnCheckoutItemResultModel[];
  /** The indexes into `results` still needing 3-D Secure, in the order they are walked. */
  pendingIndexes: number[];
  /** How far along `pendingIndexes` the walk is. */
  pendingPosition: number;

  error: string | null;
  errorCode?: string;
  /** Which step a `RETRY` goes back to. */
  retryFrom: PackCheckoutStep | null;
}

export type PackCheckoutEvent =
  | { type: 'QUOTE_REQUESTED'; appId: string; items: AddOnCheckoutItemInput[] }
  | { type: 'QUOTE_RECEIVED'; token: StepToken; quote: AddOnCheckoutQuoteModel }
  | { type: 'QUOTE_FAILED'; token: StepToken; message: string; errorCode?: string }
  /** The quote needs a card: start collecting one. */
  | { type: 'CARD_REQUESTED' }
  | { type: 'CARD_INTENT_RECEIVED'; token: StepToken; clientSecret: string; paymentTransactionId: string }
  | { type: 'CARD_INTENT_FAILED'; token: StepToken; message: string; errorCode?: string }
  /** The customer confirmed the SetupIntent in the card form. */
  | { type: 'CARD_CONFIRMED'; token: StepToken; paymentTransactionId?: string }
  | { type: 'CARD_FAILED'; token: StepToken; message: string }
  /** Buy the basket with whatever card the flow has (saved, or the one just collected). */
  | { type: 'CHECKOUT_REQUESTED' }
  | { type: 'CHECKOUT_RECEIVED'; token: StepToken; result: AddOnCheckoutResultModel }
  | { type: 'CHECKOUT_FAILED'; token: StepToken; message: string; errorCode?: string }
  /** The current pack's 3-D Secure was confirmed in the browser/app. */
  | { type: 'ITEM_AUTHENTICATED'; token: StepToken }
  | { type: 'ITEM_AUTH_FAILED'; token: StepToken; message: string }
  | { type: 'ITEM_COMPLETED'; token: StepToken; result: AddOnCheckoutItemResultModel }
  | { type: 'RETRY' }
  | { type: 'RESET' };

export interface PackCheckoutMachineOptions {
  appId?: string;
  items?: AddOnCheckoutItemInput[];
}

export function initialPackCheckoutState(options: PackCheckoutMachineOptions = {}): PackCheckoutState {
  return {
    step: 'idle',
    token: null,
    appId: options.appId ?? '',
    items: options.items ?? [],
    quote: null,
    useSavedCard: false,
    results: [],
    pendingIndexes: [],
    pendingPosition: 0,
    error: null,
    retryFrom: null,
  };
}

function enter(state: PackCheckoutState, step: PackCheckoutStep): PackCheckoutState {
  const startsWork =
    step === 'quoting' ||
    step === 'collectingCard' ||
    step === 'checkingOut' ||
    step === 'authenticating' ||
    step === 'completing';
  return {
    ...state,
    step,
    token: startsWork ? issueStepToken() : null,
    error: null,
    errorCode: undefined,
    retryFrom: null,
  };
}

function fail(
  state: PackCheckoutState,
  message: string,
  retryFrom: PackCheckoutStep,
  errorCode?: string,
): PackCheckoutState {
  return { ...state, step: 'failed', token: null, error: message, errorCode, retryFrom };
}

/** The pack currently being authenticated/completed, or `undefined` when the walk is over. */
export function currentPackCheckoutItem(state: PackCheckoutState): AddOnCheckoutItemResultModel | undefined {
  const index = state.pendingIndexes[state.pendingPosition];
  return index == null ? undefined : state.results[index];
}

/** Move to the next pack needing 3-D Secure, or finish. */
function nextPending(state: PackCheckoutState): PackCheckoutState {
  const advanced = { ...state, pendingPosition: state.pendingPosition + 1 };
  if (advanced.pendingPosition >= advanced.pendingIndexes.length) {
    return { ...advanced, step: 'done', token: null, error: null, errorCode: undefined, retryFrom: null };
  }
  return enter(advanced, 'authenticating');
}

/** Replace the current pack's result, keeping its place in `results`. */
function replaceCurrent(
  state: PackCheckoutState,
  patch: Partial<AddOnCheckoutItemResultModel>,
): AddOnCheckoutItemResultModel[] {
  const index = state.pendingIndexes[state.pendingPosition];
  if (index == null) return state.results;
  return state.results.map((result, i) => (i === index ? { ...result, ...patch } : result));
}

/**
 * The pack-checkout reducer. Pure apart from issuing step tokens, and it returns the SAME state
 * object for an event it ignores.
 */
export function packCheckoutTransition(state: PackCheckoutState, event: PackCheckoutEvent): PackCheckoutState {
  switch (event.type) {
    case 'QUOTE_REQUESTED':
      // Re-quoting while a quote is in flight is allowed and supersedes it — that is exactly what
      // a StrictMode-doubled effect does, and the older answer is then dropped as stale.
      if (state.step !== 'idle' && state.step !== 'failed' && state.step !== 'quoted' && state.step !== 'quoting') {
        return state;
      }
      return enter({ ...state, appId: event.appId, items: event.items, quote: null }, 'quoting');

    case 'QUOTE_RECEIVED': {
      if (state.step !== 'quoting' || !isCurrentStep(state.token, event.token)) return state;
      if (!event.quote?.success) {
        return fail(
          { ...state, quote: event.quote ?? null },
          event.quote?.errorMessage ?? 'The packs could not be priced.',
          'quoting',
          event.quote?.errorCode,
        );
      }
      return {
        ...enter({ ...state, quote: event.quote }, 'quoted'),
        // A quote that needs no new card is bought against the one already on file.
        useSavedCard: !event.quote.requiresPaymentMethod,
      };
    }

    case 'QUOTE_FAILED':
      if (state.step !== 'quoting' || !isCurrentStep(state.token, event.token)) return state;
      return fail(state, event.message, 'quoting', event.errorCode);

    case 'CARD_REQUESTED':
      if (state.step !== 'quoted') return state;
      return enter({ ...state, cardClientSecret: undefined }, 'collectingCard');

    case 'CARD_INTENT_RECEIVED':
      if (state.step !== 'collectingCard' || !isCurrentStep(state.token, event.token)) return state;
      return {
        ...state,
        cardClientSecret: event.clientSecret,
        paymentTransactionId: event.paymentTransactionId,
      };

    case 'CARD_INTENT_FAILED':
      if (state.step !== 'collectingCard' || !isCurrentStep(state.token, event.token)) return state;
      return fail(state, event.message, 'collectingCard', event.errorCode);

    case 'CARD_CONFIRMED': {
      if (state.step !== 'collectingCard' || !isCurrentStep(state.token, event.token)) return state;
      const withCard: PackCheckoutState = {
        ...state,
        paymentTransactionId: event.paymentTransactionId ?? state.paymentTransactionId,
        useSavedCard: false,
      };
      return enter(withCard, 'checkingOut');
    }

    case 'CARD_FAILED':
      if (state.step !== 'collectingCard' || !isCurrentStep(state.token, event.token)) return state;
      return fail(state, event.message, 'collectingCard');

    case 'CHECKOUT_REQUESTED':
      if (state.step !== 'quoted') return state;
      return enter(state, 'checkingOut');

    case 'CHECKOUT_RECEIVED': {
      if (state.step !== 'checkingOut' || !isCurrentStep(state.token, event.token)) return state;
      const results = event.result?.results ?? [];
      if (results.length === 0) {
        return fail(
          state,
          event.result?.errorMessage ?? 'The packs could not be bought.',
          'checkingOut',
          event.result?.errorCode,
        );
      }
      const pendingIndexes = results
        .map((item, index) => (item.status === 'requires_action' ? index : -1))
        .filter((index) => index >= 0);
      const withResults: PackCheckoutState = { ...state, results, pendingIndexes, pendingPosition: 0 };
      if (pendingIndexes.length === 0) {
        return { ...withResults, step: 'done', token: null, error: null, errorCode: undefined, retryFrom: null };
      }
      return enter(withResults, 'authenticating');
    }

    case 'CHECKOUT_FAILED':
      if (state.step !== 'checkingOut' || !isCurrentStep(state.token, event.token)) return state;
      return fail(state, event.message, 'checkingOut', event.errorCode);

    case 'ITEM_AUTHENTICATED':
      if (state.step !== 'authenticating' || !isCurrentStep(state.token, event.token)) return state;
      return enter(state, 'completing');

    case 'ITEM_AUTH_FAILED': {
      if (state.step !== 'authenticating' || !isCurrentStep(state.token, event.token)) return state;
      // This pack is lost; the rest of the basket is not.
      const results = replaceCurrent(state, { status: 'failed', errorMessage: event.message });
      return nextPending({ ...state, results });
    }

    case 'ITEM_COMPLETED': {
      if (state.step !== 'completing' || !isCurrentStep(state.token, event.token)) return state;
      const results = replaceCurrent(state, event.result);
      return nextPending({ ...state, results });
    }

    case 'RETRY': {
      if (state.step !== 'failed' || !state.retryFrom) return state;
      return enter(state, state.retryFrom);
    }

    case 'RESET':
      return initialPackCheckoutState({ appId: state.appId, items: state.items });

    default:
      return state;
  }
}
