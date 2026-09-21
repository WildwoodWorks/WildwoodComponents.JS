// What a plan change says about itself while it is neither waiting on the customer nor finished -
// the native twin of @wildwood/react's registrationSubscription/parts/PlanChangeNotice.
//
// Three things, and all of them matter to somebody holding a card: the bank is being asked (or the
// server is still applying a change that HAS been paid for), a failure with the way back, and - the
// one the web does not need - a change that needs a card the SURFACE cannot collect. A surface that
// mounts the built-in `PaymentModal` (the manage view, `SubscriptionAdminComponent`) collects it
// there and this notice says nothing about the card step; one that does not would otherwise park in
// `collectingPayment` forever, so it is told where the purchase can be finished instead.
//
// Which of the two applies is `planChangeCardSource`, so the notice and the surface that mounts the
// modal cannot disagree about who is taking the card.
//
// A failed change is never silent: a customer whose card was declined mid-upgrade would otherwise be
// left looking at the plan they still have.

import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { PlanChangeFlow, RegistrationSubscriptionLabels } from '@wildwood/react-shared';
import { planChangeCardSource } from '../views/manageViewModel';

/** Which of the notice's four shapes applies. */
export type PlanChangeNoticeKind = 'none' | 'progress' | 'payment' | 'failed';

export interface PlanChangeNoticeContent {
  kind: PlanChangeNoticeKind;
  /** Heading, on a failure. */
  title?: string;
  /** The sentence to show. Empty when nothing is shown. */
  message: string;
  /** Whether the failed step can be run again. */
  canRetry: boolean;
  /** Whether the notice offers a way to abandon the change. */
  canDismiss: boolean;
}

/** How the surface rendering the notice takes a card, when the change needs one. */
export interface PlanChangeNoticeOptions {
  /**
   * The surface mounts the built-in {@link import('./PaymentModal').PaymentModal}, so the card step
   * speaks for itself and this notice says nothing about it. Defaults to false - a surface that
   * collects nothing has to say where the purchase can be finished.
   */
  collectsPaymentInApp?: boolean;
}

/** What the flow's state means for this notice. A rule, so it can be tested without a renderer. */
export function planChangeNoticeContent(
  flow: Pick<PlanChangeFlow, 'step' | 'paymentRequest' | 'error' | 'canRetry'>,
  labels: RegistrationSubscriptionLabels,
  options: PlanChangeNoticeOptions = {},
): PlanChangeNoticeContent {
  if (flow.step === 'authenticating') {
    return { kind: 'progress', message: labels.authenticatingChange, canRetry: false, canDismiss: false };
  }
  if (flow.step === 'completing') {
    return { kind: 'progress', message: labels.applyingChange, canRetry: false, canDismiss: false };
  }
  // A card is wanted and nothing on this surface can take one: no host handler (the flow would be
  // driving that itself) and no built-in modal mounted here either.
  const card = planChangeCardSource({
    step: flow.step,
    // A host handler means `paymentRequest` is null, so this is settled by the request alone.
    hasHostHandler: false,
    paymentRequest: flow.paymentRequest,
    collectsPaymentInApp: options.collectsPaymentInApp === true,
  });
  if (card === 'finishOnWeb') {
    return { kind: 'payment', message: labels.finishOnWeb, canRetry: false, canDismiss: true };
  }
  if (flow.step === 'failed') {
    return {
      kind: 'failed',
      title: labels.planChangeFailed,
      message: flow.error ?? '',
      canRetry: flow.canRetry,
      canDismiss: true,
    };
  }
  return { kind: 'none', message: '', canRetry: false, canDismiss: false };
}

export interface PlanChangeNoticeProps {
  flow: PlanChangeFlow;
  labels: RegistrationSubscriptionLabels;
  /** The surface mounts the built-in card modal, so the notice stays out of the card step. */
  collectsPaymentInApp?: boolean;
  style?: ViewStyle;
}

export function PlanChangeNotice({ flow, labels, collectsPaymentInApp, style }: PlanChangeNoticeProps) {
  const content = planChangeNoticeContent(flow, labels, { collectsPaymentInApp });
  if (content.kind === 'none') return null;

  // `plan-change-notice` on both shapes, as Swift does: a suite waiting for the notice is waiting
  // for the change to say SOMETHING about itself, and which of the two shapes says it is a detail of
  // where the change got to.
  if (content.kind === 'progress') {
    return (
      <View style={[styles.progress, style]} testID="plan-change-notice">
        <ActivityIndicator size="small" color="#007AFF" />
        <Text style={styles.progressText}>{content.message}</Text>
      </View>
    );
  }

  const danger = content.kind === 'failed';

  return (
    <View
      style={[danger ? styles.alertDanger : styles.alertInfo, style]}
      accessibilityRole="alert"
      testID="plan-change-notice"
    >
      <View style={styles.alertBody}>
        {content.title ? (
          <Text style={[styles.alertTitle, danger ? styles.dangerText : styles.infoText]}>{content.title}</Text>
        ) : null}
        {content.message ? (
          <Text style={[styles.alertText, danger ? styles.dangerText : styles.infoText]}>{content.message}</Text>
        ) : null}
        <View style={styles.alertActions}>
          {content.canRetry ? (
            <Pressable testID="plan-change-retry" style={styles.retryBtn} onPress={flow.retry}>
              <Text style={styles.retryBtnText}>{labels.tryAgain}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {content.canDismiss ? (
        <Pressable testID="plan-change-dismiss" onPress={flow.reset} accessibilityLabel={labels.cancel}>
          <Text style={[styles.dismiss, danger ? styles.dangerText : styles.infoText]}>{'✕'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, marginBottom: 12 },
  progressText: { fontSize: 14, color: '#666' },
  alertDanger: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  alertInfo: {
    backgroundColor: '#DBEAFE',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  alertBody: { flex: 1, gap: 6 },
  alertTitle: { fontSize: 14, fontWeight: '700' },
  alertText: { fontSize: 14 },
  dangerText: { color: '#991B1B' },
  infoText: { color: '#1D4ED8' },
  alertActions: { flexDirection: 'row', gap: 8 },
  retryBtn: {
    borderWidth: 1,
    borderColor: '#991B1B',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  retryBtnText: { color: '#991B1B', fontSize: 13, fontWeight: '600' },
  dismiss: { fontSize: 18, paddingLeft: 8 },
});
