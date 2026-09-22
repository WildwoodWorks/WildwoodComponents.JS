'use client';

// Buying the packs a new account asked for: one quote, one card at most, one purchase, then any
// pack the bank wants authenticated, one at a time.
//
// It runs AFTER the account exists and is signed in, because packs are bought as the user — the
// quote finds the customer the plan's payment already created, so a card taken minutes ago on the
// payment step is the saved card here and nothing is asked for twice.
//
// Every server call is keyed on the machine's step token: StrictMode's doubled effects, a
// re-render and a payment callback that fires twice all land on a token the machine has moved
// past, so nothing is quoted or bought twice.
//
// The card itself is the one thing this hook does not own. The web mounts Stripe Elements and
// confirms the SetupIntent in its own form — `hostCollectsCard`, where the hook fetches the intent
// and the publishable key, hands them over and waits for `cardConfirmed`. A native host instead
// supplies a {@link PaymentActionAdapter} that can confirm intents, or supplies neither, in which
// case no card is ever asked for and the basket says so in the `finishOnWeb` words.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { AddOnCheckoutItemInput, AddOnCheckoutItemResultModel, AddOnCheckoutQuoteModel } from '@wildwood/core';
import { useWildwood } from '../hooks/useWildwood.js';
import {
  currentPackCheckoutItem,
  initialPackCheckoutState,
  packCheckoutTransition,
  type PackCheckoutState,
  type PackCheckoutStep,
} from './packCheckoutMachine.js';
import type { SignupPackOutcome } from './signupMachine.js';
import type { StepToken } from './stepTokens.js';
import type { PaymentActionAdapter } from './paymentActions.js';
import type { RegistrationSubscriptionLabels } from './labels.js';
import type { RegistrationSubscriptionError } from './types.js';

/** Said when a pack's own 3-D Secure could not be put to the customer at all. */
const PACK_UNCONFIRMED = 'This pack could not be confirmed with your bank.';
/** Said when it was put to them and came back refused. */
const CARD_UNCONFIRMED = 'Your card was not confirmed.';
/** Said when the server would not hand out a SetupIntent. */
const CARD_UNAVAILABLE = 'A card could not be collected right now.';

export interface PackCheckoutFlowOptions {
  appId: string;
  /** The packs still to buy — the chosen ones, minus anything a registration token granted. */
  items: AddOnCheckoutItemInput[];
  /** Pack names from the catalog, so an outcome can name a pack the quote never priced. */
  names?: Record<string, string>;
  labels: RegistrationSubscriptionLabels;
  /**
   * The host renders the card form itself (Stripe Elements on the web). The flow fetches the
   * SetupIntent and the publishable key, exposes both, and then waits for
   * {@link PackCheckoutFlow.cardConfirmed} or {@link PackCheckoutFlow.cardFailed}.
   */
  hostCollectsCard?: boolean;
  /** How intents the customer has to answer are confirmed. See the header. */
  paymentActions?: PaymentActionAdapter;
  /** Every requested pack's outcome, including the ones that failed or were skipped. */
  onFinished: (packs: SignupPackOutcome[]) => void;
  onError?: (error: RegistrationSubscriptionError) => void;
}

export interface PackCheckoutFlow {
  state: PackCheckoutState;
  step: PackCheckoutStep;
  /** The Stripe account the SetupIntent belongs to, for a host that mounts its own card field. */
  publishableKey?: string;
  /** The SetupIntent that host's card field has to confirm. */
  cardClientSecret?: string;
  /** Whether a server call is in flight. */
  busy: boolean;
  /** The pack whose card is being authenticated, named, for the status line. */
  authenticatingName: string;
  /** The host's card field confirmed the SetupIntent. */
  cardConfirmed: () => void;
  /** The host's card field could not confirm it. */
  cardFailed: (message: string) => void;
  /** Run the failed step again. A card is always collected afresh. */
  retry: () => void;
  /** Give up on the packs and let the signup finish: they are reported as failed, not forgotten. */
  skip: () => void;
}

/** One outcome per requested pack, so nothing the visitor asked for goes unmentioned. */
export function toPackOutcomes(
  items: AddOnCheckoutItemInput[],
  results: AddOnCheckoutItemResultModel[],
  quote: AddOnCheckoutQuoteModel | null,
  names: Record<string, string> | undefined,
  fallbackMessage: string | null,
): SignupPackOutcome[] {
  return items.map((item) => {
    const result = results.find((candidate) => candidate.addOnId === item.addOnId);
    const line = quote?.lines.find((candidate) => candidate.addOnId === item.addOnId);
    const name = names?.[item.addOnId] ?? line?.name ?? item.addOnId;

    if (result?.status === 'trialing' || result?.status === 'active') {
      return { addOnId: item.addOnId, name, status: result.status, trialEnd: result.trialEnd };
    }
    return {
      addOnId: item.addOnId,
      name,
      status: 'failed',
      errorMessage: result?.errorMessage ?? fallbackMessage ?? undefined,
    };
  });
}

export function usePackCheckoutFlow(options: PackCheckoutFlowOptions): PackCheckoutFlow {
  const { appId, labels } = options;
  const client = useWildwood();
  const [state, dispatch] = useReducer(
    packCheckoutTransition,
    { appId, items: options.items },
    initialPackCheckoutState,
  );
  const [publishableKey, setPublishableKey] = useState<string | undefined>();

  // One run per step token. A doubled effect carries the token its first run already claimed.
  const runs = useRef<Record<string, StepToken | null>>({});
  const claim = (key: string, token: StepToken | null): boolean => {
    if (!token || runs.current[key] === token) return false;
    runs.current[key] = token;
    return true;
  };
  const started = useRef(false);
  const finished = useRef(false);

  // Latest callbacks and options, so the driver effect never re-runs because a host re-rendered.
  const latest = useRef(options);
  latest.current = options;
  // The machine, for the callbacks that answer outside the driver effect.
  const machine = useRef(state);
  machine.current = state;

  const report = useCallback((code: string, message: string) => {
    latest.current.onError?.({ code, message });
  }, []);

  /** The Stripe account the quote's provider belongs to. Looked up once, then reused. */
  const keyLookup = useRef<Promise<string | undefined> | null>(null);
  const resolvePublishableKey = useCallback(
    (providerId: string | undefined): Promise<string | undefined> => {
      if (!keyLookup.current) {
        keyLookup.current = client.payment
          .getAppPaymentConfiguration(appId)
          .then((config) => {
            const providers = config?.providers ?? [];
            const provider =
              providers.find((candidate) => candidate.id === providerId) ??
              providers.find((candidate) => candidate.isEnabled && candidate.publishableKey);
            return provider?.publishableKey;
          })
          .catch(() => undefined);
      }
      return keyLookup.current;
    },
    [client, appId],
  );

  const runQuote = useCallback(
    async (token: StepToken) => {
      try {
        const quote = await client.appTier.quoteAddOnCheckout(appId, latest.current.items);
        if (!quote?.success) {
          report('pack_quote_failed', quote?.errorMessage ?? labels.packsUnavailable);
        }
        dispatch({ type: 'QUOTE_RECEIVED', token, quote });
      } catch (err) {
        const message = err instanceof Error ? err.message : labels.packsUnavailable;
        report('pack_quote_failed', message);
        dispatch({ type: 'QUOTE_FAILED', token, message });
      }
    },
    [client, appId, labels.packsUnavailable, report],
  );

  const runCardIntent = useCallback(
    async (token: StepToken, providerId: string | undefined) => {
      const actions = latest.current.paymentActions;
      if (!latest.current.hostCollectsCard && !actions?.confirmCardSetup) {
        // Nothing here can take a card, so none is asked for: no SetupIntent is created, and the
        // customer is told where the basket can be paid for instead.
        report('pack_card_failed', labels.finishOnWeb);
        dispatch({ type: 'CARD_INTENT_FAILED', token, message: labels.finishOnWeb });
        return;
      }
      try {
        const [intent, key] = await Promise.all([
          client.appTier.createCheckoutPaymentMethod(appId, providerId ?? ''),
          resolvePublishableKey(providerId),
        ]);
        if (!intent?.success || !intent.clientSecret || !intent.paymentTransactionId || !key) {
          const message = intent?.errorMessage ?? CARD_UNAVAILABLE;
          report('pack_card_failed', message);
          dispatch({ type: 'CARD_INTENT_FAILED', token, message, errorCode: intent?.errorCode });
          return;
        }
        setPublishableKey(key);
        dispatch({
          type: 'CARD_INTENT_RECEIVED',
          token,
          clientSecret: intent.clientSecret,
          paymentTransactionId: intent.paymentTransactionId,
        });

        // The host's own card field takes it from here; an adapter-driven host has the flow
        // confirm the SetupIntent itself.
        if (!latest.current.hostCollectsCard && actions?.confirmCardSetup) {
          const outcome = await actions.confirmCardSetup(intent.clientSecret, key);
          if (outcome.status === 'succeeded') {
            dispatch({ type: 'CARD_CONFIRMED', token, paymentTransactionId: intent.paymentTransactionId });
            return;
          }
          const message = (outcome.status === 'failed' ? outcome.message : '') || CARD_UNCONFIRMED;
          // A cancel is the customer's choice, not a fault worth reporting to the host.
          if (outcome.status === 'failed') report('pack_card_failed', message);
          dispatch({ type: 'CARD_FAILED', token, message });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : CARD_UNAVAILABLE;
        report('pack_card_failed', message);
        dispatch({ type: 'CARD_INTENT_FAILED', token, message });
      }
    },
    [client, appId, labels.finishOnWeb, resolvePublishableKey, report],
  );

  const runCheckout = useCallback(
    async (
      token: StepToken,
      quote: AddOnCheckoutQuoteModel,
      paymentTransactionId: string | undefined,
      saved: boolean,
    ) => {
      try {
        const result = await client.appTier.checkoutAddOns(appId, {
          checkoutId: quote.checkoutId,
          providerId: quote.providerId ?? '',
          ...(saved ? { useSavedCard: true } : { paymentTransactionId }),
          items: latest.current.items,
        });
        if (!result?.success && (result?.results?.length ?? 0) === 0) {
          report('pack_checkout_failed', result?.errorMessage ?? labels.packsUnavailable);
        }
        dispatch({ type: 'CHECKOUT_RECEIVED', token, result });
      } catch (err) {
        const message = err instanceof Error ? err.message : labels.packsUnavailable;
        report('pack_checkout_failed', message);
        dispatch({ type: 'CHECKOUT_FAILED', token, message });
      }
    },
    [client, appId, labels.packsUnavailable, report],
  );

  const runAuthenticate = useCallback(
    async (token: StepToken, item: AddOnCheckoutItemResultModel, providerId: string | undefined) => {
      const actions = latest.current.paymentActions;
      if (!actions) {
        // Only this pack is marked; the basket carries on, as it does for any other refusal.
        dispatch({ type: 'ITEM_AUTH_FAILED', token, message: latest.current.labels.finishOnWeb });
        return;
      }
      try {
        const key = await resolvePublishableKey(providerId);
        if (!key || !item.clientSecret) {
          dispatch({ type: 'ITEM_AUTH_FAILED', token, message: PACK_UNCONFIRMED });
          return;
        }
        const outcome = await actions.confirmPayment(item.clientSecret, key);
        if (outcome.status === 'succeeded') {
          dispatch({ type: 'ITEM_AUTHENTICATED', token });
          return;
        }
        dispatch({
          type: 'ITEM_AUTH_FAILED',
          token,
          message: (outcome.status === 'failed' ? outcome.message : '') || CARD_UNCONFIRMED,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : CARD_UNCONFIRMED;
        dispatch({ type: 'ITEM_AUTH_FAILED', token, message });
      }
    },
    [resolvePublishableKey],
  );

  const runComplete = useCallback(
    async (token: StepToken, item: AddOnCheckoutItemResultModel) => {
      const result = await client.appTier.completeAddOnCheckout(appId, item.paymentTransactionId ?? '');
      // The server answers a refusal with the item itself, so its addOnId is kept whatever happened.
      dispatch({ type: 'ITEM_COMPLETED', token, result: { ...result, addOnId: result.addOnId || item.addOnId } });
    },
    [client, appId],
  );

  // The driver. One effect, one switch: every async step runs exactly once per token.
  useEffect(() => {
    const token = state.token;
    switch (state.step) {
      case 'idle':
        if (!started.current) {
          started.current = true;
          dispatch({ type: 'QUOTE_REQUESTED', appId, items: latest.current.items });
        }
        break;
      case 'quoting':
        if (claim('quote', token)) void runQuote(token as StepToken);
        break;
      case 'quoted':
        dispatch(state.quote?.requiresPaymentMethod ? { type: 'CARD_REQUESTED' } : { type: 'CHECKOUT_REQUESTED' });
        break;
      case 'collectingCard':
        if (claim('card', token)) void runCardIntent(token as StepToken, state.quote?.providerId);
        break;
      case 'checkingOut':
        if (state.quote && claim('checkout', token)) {
          void runCheckout(token as StepToken, state.quote, state.paymentTransactionId, state.useSavedCard);
        }
        break;
      case 'authenticating': {
        const item = currentPackCheckoutItem(state);
        if (item && claim(`auth:${state.pendingPosition}`, token)) {
          void runAuthenticate(token as StepToken, item, state.quote?.providerId);
        }
        break;
      }
      case 'completing': {
        const item = currentPackCheckoutItem(state);
        if (item && claim(`complete:${state.pendingPosition}`, token)) void runComplete(token as StepToken, item);
        break;
      }
      case 'done':
        if (!finished.current) {
          finished.current = true;
          latest.current.onFinished(
            toPackOutcomes(latest.current.items, state.results, state.quote, latest.current.names, null),
          );
        }
        break;
      default:
        break;
    }
  }, [state, appId, runQuote, runCardIntent, runCheckout, runAuthenticate, runComplete]);

  const cardConfirmed = useCallback(() => {
    const current = machine.current;
    dispatch({
      type: 'CARD_CONFIRMED',
      token: current.token as StepToken,
      paymentTransactionId: current.paymentTransactionId,
    });
  }, []);

  const cardFailed = useCallback(
    (message: string) => {
      report('pack_card_failed', message);
      dispatch({ type: 'CARD_FAILED', token: machine.current.token as StepToken, message });
    },
    [report],
  );

  const retry = useCallback(() => {
    dispatch({ type: 'RETRY' });
  }, []);

  const skip = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    const current = machine.current;
    latest.current.onFinished(
      toPackOutcomes(latest.current.items, current.results, current.quote, latest.current.names, current.error),
    );
  }, []);

  const authenticatingName = useMemo(() => {
    const item = currentPackCheckoutItem(state);
    if (!item) return '';
    return (
      latest.current.names?.[item.addOnId] ?? state.quote?.lines.find((l) => l.addOnId === item.addOnId)?.name ?? ''
    );
  }, [state]);

  return {
    state,
    step: state.step,
    publishableKey,
    cardClientSecret: state.cardClientSecret,
    busy: state.step === 'checkingOut' || state.step === 'authenticating' || state.step === 'completing',
    authenticatingName,
    cardConfirmed,
    cardFailed,
    retry,
    skip,
  };
}
