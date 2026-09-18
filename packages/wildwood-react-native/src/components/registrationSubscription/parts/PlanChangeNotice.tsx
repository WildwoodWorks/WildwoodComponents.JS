// What a plan change says about itself while it is neither waiting on the customer nor finished -
// the native twin of @wildwood/react's registrationSubscription/parts/PlanChangeNotice.
//
// Three things, and all of them matter to somebody holding a card: the bank is being asked (or the
// server is still applying a change that HAS been paid for), a failure with the way back, and - the
// one the web does not need - a change that needs a card this stack cannot collect. React Native
// ships no payment SDK in the box, so with no host `onPaymentRequired` and no built-in card modal
// the flow parks in `collectingPayment`; saying where the purchase can be finished is the honest
// thing to show, rather than a spinner that never resolves.
//
// A failed change is never silent: a customer whose card was declined mid-upgrade would otherwise be
// left looking at the plan they still have.

import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { PlanChangeFlow, RegistrationSubscriptionLabels } from '@wildwood/react-shared';

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

/** What the flow's state means for this notice. A rule, so it can be tested without a renderer. */
export function planChangeNoticeContent(
  flow: Pick<PlanChangeFlow, 'step' | 'paymentRequest' | 'error' | 'canRetry'>,
  labels: RegistrationSubscriptionLabels,
): PlanChangeNoticeContent {
  if (flow.step === 'authenticating') {
    return { kind: 'progress', message: labels.authenticatingChange, canRetry: false, canDismiss: false };
  }
  if (flow.step === 'completing') {
    return { kind: 'progress', message: labels.applyingChange, canRetry: false, canDismiss: false };
  }
  // A card is wanted and nothing here can take one: no host handler (the flow would be driving it)
  // and no built-in modal on this platform yet.
  if (flow.step === 'collectingPayment' && flow.paymentRequest) {
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
  style?: ViewStyle;
}

export function PlanChangeNotice({ flow, labels, style }: PlanChangeNoticeProps) {
  const content = planChangeNoticeContent(flow, labels);
  if (content.kind === 'none') return null;

  if (content.kind === 'progress') {
    return (
      <View style={[styles.progress, style]}>
        <ActivityIndicator size="small" color="#007AFF" />
        <Text style={styles.progressText}>{content.message}</Text>
      </View>
    );
  }

  const danger = content.kind === 'failed';

  return (
    <View style={[danger ? styles.alertDanger : styles.alertInfo, style]} accessibilityRole="alert">
      <View style={styles.alertBody}>
        {content.title ? (
          <Text style={[styles.alertTitle, danger ? styles.dangerText : styles.infoText]}>{content.title}</Text>
        ) : null}
        {content.message ? (
          <Text style={[styles.alertText, danger ? styles.dangerText : styles.infoText]}>{content.message}</Text>
        ) : null}
        <View style={styles.alertActions}>
          {content.canRetry ? (
            <Pressable style={styles.retryBtn} onPress={flow.retry}>
              <Text style={styles.retryBtnText}>{labels.tryAgain}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {content.canDismiss ? (
        <Pressable onPress={flow.reset} accessibilityLabel={labels.cancel}>
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
