// What became of each pack. One row per pack, including the ones that failed.
//
// A basket is not a transaction: one pack can fail while the rest run, so this never collapses the
// list into a single "done" - the customer is told, per pack, what they ended up with.

import { View, Text, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { RegistrationSubscriptionLabels, SignupPackOutcome, SignupPackStatus } from '@wildwood/react-shared';
import { wwPackTestId } from '../testIds';

export interface PackOutcomeListProps {
  packs: SignupPackOutcome[];
  labels: RegistrationSubscriptionLabels;
  style?: ViewStyle;
}

function statusLabel(status: SignupPackStatus, labels: RegistrationSubscriptionLabels): string {
  switch (status) {
    case 'trialing':
      return labels.packStatusTrialing;
    case 'active':
      return labels.packStatusActive;
    case 'granted':
      return labels.packStatusGranted;
    default:
      return labels.packStatusFailed;
  }
}

/** A trial end date in the device's own locale, or nothing when the server sent no usable date. */
function trialEndText(trialEnd: string | undefined): string {
  if (!trialEnd) return '';
  const date = new Date(trialEnd);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

export function PackOutcomeList({ packs, labels, style }: PackOutcomeListProps) {
  if (packs.length === 0) return null;

  return (
    <View style={[styles.list, style]} testID="pack-outcomes">
      {packs.map((pack) => {
        const trialEnd = trialEndText(pack.trialEnd);
        const failed = pack.status === 'failed';
        return (
          <View style={styles.row} key={pack.addOnId} testID={wwPackTestId(pack.addOnId)}>
            <Text style={styles.name}>{pack.name}</Text>
            <Text style={[styles.status, failed ? styles.statusFailed : styles.statusOk]}>
              {statusLabel(pack.status, labels)}
            </Text>
            {trialEnd ? <Text style={styles.trialEnd}>{trialEnd}</Text> : null}
            {pack.errorMessage ? <Text style={styles.error}>{pack.errorMessage}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, alignSelf: 'stretch' },
  row: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    gap: 2,
  },
  name: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  status: { fontSize: 13, fontWeight: '600' },
  statusOk: { color: '#166534' },
  statusFailed: { color: '#991B1B' },
  trialEnd: { fontSize: 12, color: '#666' },
  error: { fontSize: 13, color: '#991B1B' },
});
