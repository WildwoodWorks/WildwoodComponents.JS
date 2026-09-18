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

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { AddOnCheckoutItemInput, AddOnCheckoutItemResultModel, AddOnCheckoutQuoteModel } from '@wildwood/core';
import {
  currentPackCheckoutItem,
  initialPackCheckoutState,
  packCheckoutTransition,
  type SignupPackOutcome,
  type StepToken,
} from '@wildwood/react-shared';
import { useWildwood } from '../../../hooks/useWildwood.js';
import { createStripeInstance } from '../../payment/useStripeCardElement.js';
import { formatLabel, type RegistrationSubscriptionLabels } from '../labels.js';
import type { RegistrationSubscriptionError } from '../types.js';
import { CardSetupForm } from './CardSetupForm.js';
import { OrderSummary } from './OrderSummary.js';

export interface PackCheckoutProps {
  appId: string;
  /** The packs still to buy — the chosen ones, minus anything a registration token granted. */
  items: AddOnCheckoutItemInput[];
  /** Pack names from the catalog, so an outcome can name a pack the quote never priced. */
  names?: Record<string, string>;
  labels: RegistrationSubscriptionLabels;
  /** Every requested pack's outcome, including the ones that failed or were skipped. */
  onFinished: (packs: SignupPackOutcome[]) => void;
  onError?: (error: RegistrationSubscriptionError) => void;
}

/** One outcome per requested pack, so nothing the visitor asked for goes unmentioned. */
function toOutcomes(
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

export function PackCheckout({ appId, items, names, labels, onFinished, onError }: PackCheckoutProps) {
  const client = useWildwood();
  const [state, dispatch] = useReducer(packCheckoutTransition, { appId, items }, initialPackCheckoutState);
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

  // Latest callbacks, so the driver effect never re-runs because a host re-rendered.
  const latest = useRef({ onFinished, onError, items, names });
  latest.current = { onFinished, onError, items, names };

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
      try {
        const [intent, key] = await Promise.all([
          client.appTier.createCheckoutPaymentMethod(appId, providerId ?? ''),
          resolvePublishableKey(providerId),
        ]);
        if (!intent?.success || !intent.clientSecret || !intent.paymentTransactionId || !key) {
          const message = intent?.errorMessage ?? 'A card could not be collected right now.';
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
      } catch (err) {
        const message = err instanceof Error ? err.message : 'A card could not be collected right now.';
        report('pack_card_failed', message);
        dispatch({ type: 'CARD_INTENT_FAILED', token, message });
      }
    },
    [client, appId, resolvePublishableKey, report],
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
      try {
        const key = await resolvePublishableKey(providerId);
        if (!key || !item.clientSecret) {
          dispatch({ type: 'ITEM_AUTH_FAILED', token, message: 'This pack could not be confirmed with your bank.' });
          return;
        }
        const stripe = await createStripeInstance(key);
        const { error } = await stripe.confirmCardPayment(item.clientSecret);
        if (error) {
          dispatch({ type: 'ITEM_AUTH_FAILED', token, message: error.message ?? 'Your card was not confirmed.' });
          return;
        }
        dispatch({ type: 'ITEM_AUTHENTICATED', token });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Your card was not confirmed.';
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
            toOutcomes(latest.current.items, state.results, state.quote, latest.current.names, null),
          );
        }
        break;
      default:
        break;
    }
  }, [state, appId, runQuote, runCardIntent, runCheckout, runAuthenticate, runComplete]);

  /** Give up on the packs and let the signup finish: they are reported as failed, not forgotten. */
  const skip = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinished(toOutcomes(latest.current.items, state.results, state.quote, latest.current.names, state.error));
  }, [onFinished, state.results, state.quote, state.error]);

  const authenticatingName = useMemo(() => {
    const item = currentPackCheckoutItem(state);
    if (!item) return '';
    return (
      latest.current.names?.[item.addOnId] ?? state.quote?.lines.find((l) => l.addOnId === item.addOnId)?.name ?? ''
    );
  }, [state]);

  const busy = state.step === 'checkingOut' || state.step === 'authenticating' || state.step === 'completing';

  return (
    <div className="ww-regsub-pack-checkout">
      {state.quote?.success ? <OrderSummary quote={state.quote} labels={labels} /> : null}

      {state.step === 'collectingCard' && (
        <CardSetupForm
          publishableKey={publishableKey}
          clientSecret={state.cardClientSecret}
          labels={labels}
          onConfirmed={() =>
            dispatch({
              type: 'CARD_CONFIRMED',
              token: state.token as StepToken,
              paymentTransactionId: state.paymentTransactionId,
            })
          }
          onFailed={(message) => {
            report('pack_card_failed', message);
            dispatch({ type: 'CARD_FAILED', token: state.token as StepToken, message });
          }}
        />
      )}

      {(state.step === 'idle' || state.step === 'quoting' || busy) && (
        <div className="ww-signup-step-status" role="status">
          <span className="ww-spinner ww-spinner-sm" />
          <span className="ww-text-muted">
            {state.step === 'authenticating' || state.step === 'completing'
              ? formatLabel(labels.authenticatingPack, { name: authenticatingName })
              : labels.buyingPacks}
          </span>
        </div>
      )}

      {state.step === 'failed' && (
        <div className="ww-regsub-pack-checkout-failed">
          <div className="ww-alert ww-alert-danger" role="alert">
            {state.error ?? labels.packsUnavailable}
          </div>
          <div className="ww-signup-processing-actions">
            <button type="button" className="ww-btn ww-btn-primary" onClick={() => dispatch({ type: 'RETRY' })}>
              {labels.tryAgain}
            </button>
            <button type="button" className="ww-btn ww-btn-link" onClick={skip}>
              {labels.skipForNow}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
