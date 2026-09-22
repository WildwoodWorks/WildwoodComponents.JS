// What a cancellation did, said once and dismissible - the native twin of @wildwood/react's
// subscription/CancelResultNotice.
//
// Scheduled or immediate, and - when the subscription is billed by a store - the part this platform
// cannot do for the customer: Apple and Google keep charging until the subscription is cancelled in
// their own settings, so the instructions and the link travel with the notice.
//
// Only a successful cancel renders here. A failed one belongs in the surrounding error alert, not in
// a notice that reads like confirmation.

import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierCancelResultModel } from '@wildwood/core';

export interface CancelResultNoticeProps {
  result: AppTierCancelResultModel | null;
  onDismiss: () => void;
  style?: ViewStyle;
}

/**
 * The sentence the notice says. Exported because this package has no React renderer, so the copy is
 * tested as the function the component calls.
 */
export function cancelResultMessage(
  result: Pick<
    AppTierCancelResultModel,
    'isScheduled' | 'effectiveDate' | 'requiresUserAction' | 'userActionInstructions'
  >,
): string {
  const scheduled = result.isScheduled
    ? `Your cancellation is scheduled — access continues until ${
        result.effectiveDate ? new Date(result.effectiveDate).toLocaleDateString() : 'the end of the billing period'
      }.`
    : 'Your subscription has been cancelled.';
  if (!result.requiresUserAction) return scheduled;
  return `${scheduled} ${result.userActionInstructions ?? 'Also cancel the subscription in your store settings.'}`;
}

export function CancelResultNotice({ result, onDismiss, style }: CancelResultNoticeProps) {
  if (!result?.success) return null;

  return (
    <View style={[styles.notice, style]}>
      <View style={styles.body}>
        <Text style={styles.text}>{cancelResultMessage(result)}</Text>
        {result.requiresUserAction && result.userActionUrl ? (
          <Pressable
            onPress={() => {
              Linking.openURL(result.userActionUrl!).catch((err) => console.warn('Failed to open URL:', err));
            }}
          >
            <Text style={styles.link}>Open subscription settings</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable onPress={onDismiss} accessibilityLabel="Dismiss">
        <Text style={styles.dismiss}>{'✕'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: '#DBEAFE',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  body: { flex: 1, gap: 6 },
  text: { color: '#1D4ED8', fontSize: 14 },
  link: { color: '#1D4ED8', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  dismiss: { color: '#1D4ED8', fontSize: 18, paddingLeft: 8 },
});
