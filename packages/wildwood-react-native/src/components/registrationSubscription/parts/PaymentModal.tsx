// The card an upgrade needs, in the component's own sheet - the native twin of @wildwood/react's
// registrationSubscription/parts/PaymentModal.
//
// Every app on the platform hand-built this: a modal, a `PaymentComponent` inside it, and a promise
// resolved with the transaction id. They all got the same three things right and one of them wrong
// at least once, so it lives here now:
//
//  · It answers EXACTLY once. A payment SDK that calls back twice, or a close after a success,
//    cannot cancel a charge that already went through.
//  · A refused card is not the end of it: the sheet stays put with `PaymentComponent`'s own message,
//    so the customer can fix the card and try again without losing the priced change behind it.
//  · A payment that succeeded with no id to complete the change with is reported rather than passed
//    off as a cancel - money moved, and somebody has to know.
//
// What differs from the web is the card itself, and it is the same difference everywhere in this
// package: there is no Stripe Elements here. `PaymentComponent` completes the payment with whatever
// the device has - the host's `PaymentActionAdapter` when one is wired, otherwise the provider's own
// page or a server-owned completion - so this sheet is worth mounting with or without a handler.
//
// The transaction is attributed to the signed-in user afterwards, best effort and detached: the
// change must not wait on it, and `linkTransactionToUser` answers false rather than throwing.

import { useCallback, useRef } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { PaymentCompletionResult } from '@wildwood/core';
import {
  formatRegistrationSubscriptionLabel as formatLabel,
  type PaymentActionAdapter,
  type PaymentRequiredArgs,
  type RegistrationSubscriptionError,
  type RegistrationSubscriptionLabels,
} from '@wildwood/react-shared';
import { useWildwood } from '../../../hooks/useWildwood';
import { PaymentComponent } from '../../PaymentComponent';

export interface PaymentModalProps {
  visible: boolean;
  /** The app the payment belongs to. Defaults to the client's configured app. */
  appId?: string;
  /** What the plan change needs paying for: the plan, its pricing model, price and trial. */
  request: PaymentRequiredArgs;
  /** The currency the plan is priced in. */
  currency?: string;
  labels: RegistrationSubscriptionLabels;
  /** Overrides the handler `WildwoodProvider` supplies, as on every component in this package. */
  paymentActionHandler?: PaymentActionAdapter;
  /** Called once: the transaction id to complete the change with, or null if nothing was paid. */
  onSettled: (paymentTransactionId: string | null) => void;
  onError?: (error: RegistrationSubscriptionError) => void;
  style?: ViewStyle;
}

export function PaymentModal({
  visible,
  appId,
  request,
  currency,
  labels,
  paymentActionHandler,
  onSettled,
  onError,
  style,
}: PaymentModalProps) {
  const client = useWildwood();
  const settled = useRef(false);

  const settle = useCallback(
    (paymentTransactionId: string | null) => {
      if (settled.current) return;
      settled.current = true;
      onSettled(paymentTransactionId);
    },
    [onSettled],
  );

  const cancel = useCallback(() => settle(null), [settle]);

  const succeeded = useCallback(
    (result: PaymentCompletionResult) => {
      const paymentTransactionId = result.transactionId ?? result.paymentIntentId ?? null;
      if (!paymentTransactionId) {
        onError?.({ code: 'payment_unconfirmed', message: labels.paymentUnconfirmed });
        settle(null);
        return;
      }
      // Complete the change first: attribution must not gate it.
      settle(paymentTransactionId);
      const userId = client.session.userId;
      // The server looks a transaction up by the provider's own id when there is one.
      const externalId = result.paymentIntentId ?? paymentTransactionId;
      if (userId) void client.payment.linkTransactionToUser(externalId, userId).catch(() => {});
    },
    [client, labels.paymentUnconfirmed, onError, settle],
  );

  const title = formatLabel(labels.upgradeToPlan, { tier: request.tierName });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={cancel}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, style]} testID="payment-modal">
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={cancel} hitSlop={8} accessibilityRole="button" accessibilityLabel={labels.closePayment}>
              <Text style={styles.close}>{'×'}</Text>
            </Pressable>
          </View>

          <PaymentComponent
            appId={appId}
            amount={request.price ?? 0}
            currency={currency}
            description={title}
            isSubscription
            pricingModelId={request.pricingModelId}
            trialDays={request.trialDays}
            customerId={client.session.userId ?? undefined}
            paymentActionHandler={paymentActionHandler}
            onPaymentSuccess={succeeded}
            onPaymentFailure={() => {
              /* Deliberate: PaymentComponent shows its own message and stays mounted for a retry. */
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', flex: 1, marginRight: 8 },
  close: { fontSize: 24, color: '#666', lineHeight: 24 },
});
