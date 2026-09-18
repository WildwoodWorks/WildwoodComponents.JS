// Buying the packs a new account asked for, on a phone.
//
// The driving - one quote, at most one card, one purchase, then any pack the bank wants
// authenticated, one at a time, each claimed by the machine's step token - is `usePackCheckoutFlow`
// in `@wildwood/react-shared`, exactly as the web's `PackCheckout` uses it. What differs is the card.
//
// The web mounts Stripe Elements and confirms the SetupIntent in its own form, which is what
// `hostCollectsCard` is for. This package ships no payment SDK, so it NEVER sets that flag: either
// the host wired a `PaymentActionAdapter` that can confirm a SetupIntent - and the flow collects the
// card once, through it, for a basket of any size - or nothing here can take a card. In that last
// case no SetupIntent is asked for at all (a client secret nothing can confirm is worse than none)
// and the packs are reported as not bought, with the reason, rather than failing silently.
//
// A basket the quote can pay for with a card already on file needs none of that: `useSavedCard`.

import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AddOnCheckoutItemInput } from '@wildwood/core';
import {
  usePackCheckoutFlow,
  type PaymentActionAdapter,
  type RegistrationSubscriptionError,
  type RegistrationSubscriptionLabels,
  type SignupPackOutcome,
} from '@wildwood/react-shared';
import { usePaymentActionHandler } from '../../../provider/PaymentActionContext';
import { packCheckoutCanRetry, packCheckoutCardBranch, packCheckoutStatusText } from '../views/signupViewModel';
import { OrderSummary } from './OrderSummary';

export interface PackCheckoutProps {
  appId: string;
  /** The packs still to buy - the chosen ones, minus anything a registration token granted. */
  items: AddOnCheckoutItemInput[];
  /** Pack names from the catalog, so an outcome can name a pack the quote never priced. */
  names?: Record<string, string>;
  labels: RegistrationSubscriptionLabels;
  /** Overrides the handler `WildwoodProvider` supplies, as on every component in this package. */
  paymentActionHandler?: PaymentActionAdapter;
  /** Every requested pack's outcome, including the ones that failed or were skipped. */
  onFinished: (packs: SignupPackOutcome[]) => void;
  onError?: (error: RegistrationSubscriptionError) => void;
  style?: ViewStyle;
}

export function PackCheckout({
  appId,
  items,
  names,
  labels,
  paymentActionHandler,
  onFinished,
  onError,
  style,
}: PackCheckoutProps) {
  const handler = usePaymentActionHandler(paymentActionHandler);
  const flow = usePackCheckoutFlow({
    appId,
    items,
    names,
    labels,
    // Never `hostCollectsCard`: there is no card field on this stack to hand an intent to.
    paymentActions: handler,
    onFinished,
    onError,
  });
  const { state } = flow;

  const branch = packCheckoutCardBranch({
    requiresPaymentMethod: state.quote?.requiresPaymentMethod === true,
    canConfirmCardSetup: typeof handler?.confirmCardSetup === 'function',
  });

  const working = flow.step === 'idle' || flow.step === 'quoting' || flow.step === 'collectingCard' || flow.busy;

  return (
    <View style={[styles.container, style]} testID="pack-checkout">
      {state.quote?.success ? <OrderSummary quote={state.quote} labels={labels} /> : null}

      {working ? (
        <View style={styles.status} accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.statusText}>{packCheckoutStatusText(flow.step, flow.authenticatingName, labels)}</Text>
        </View>
      ) : null}

      {flow.step === 'failed' ? (
        <View style={styles.failed}>
          <View style={styles.alertDanger} accessibilityRole="alert">
            <Text style={styles.alertDangerText}>{state.error ?? labels.packsUnavailable}</Text>
          </View>
          <View style={styles.actions}>
            {/* A basket that failed because this device cannot take a card would fail again for the
                same reason, so the only honest way on is to finish the signup without the packs. */}
            {packCheckoutCanRetry(branch) ? (
              <Pressable
                style={styles.primaryButton}
                accessibilityRole="button"
                accessibilityLabel={labels.tryAgain}
                onPress={flow.retry}
                testID="pack-checkout-retry"
              >
                <Text style={styles.primaryButtonText}>{labels.tryAgain}</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={labels.skipForNow}
              onPress={flow.skip}
              testID="pack-checkout-skip"
            >
              <Text style={styles.linkText}>{labels.skipForNow}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  statusText: { fontSize: 14, color: '#666', flex: 1 },
  failed: { gap: 12 },
  alertDanger: { backgroundColor: '#FEE2E2', borderRadius: 8, padding: 12 },
  alertDangerText: { color: '#991B1B', fontSize: 14 },
  actions: { gap: 12, alignItems: 'center' },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkText: { color: '#007AFF', fontSize: 14, fontWeight: '600' },
});
