// What a registration token sets up, in the words the server used.
//
// Everything here comes from the token's detailed validation - the tier, the pricing option, the
// packs and the extra features, with the display names the server sent. Nothing is priced: the
// visitor is not paying for any of it, and a price beside a granted plan would say they were.

import { View, Text, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { RegistrationTokenAppGrant } from '@wildwood/core';
import type { RegistrationSubscriptionLabels } from '@wildwood/react-shared';

export interface TokenPlanSummaryProps {
  /** The grant for THIS app, as `getRegistrationTokenDetails` reported it. */
  grant: RegistrationTokenAppGrant;
  labels: RegistrationSubscriptionLabels;
  style?: ViewStyle;
}

/** One entry per granted id, named the way the server named it - or by its id when it did not. */
function named(ids: string[] | undefined, names: string[] | undefined): { id: string; name: string }[] {
  return (ids ?? []).map((id, index) => ({ id, name: names?.[index] ?? id }));
}

export function TokenPlanSummary({ grant, labels, style }: TokenPlanSummaryProps) {
  const packs = named(grant.addOnIds, grant.addOnNames);
  const features = named(grant.featureCodes, grant.featureNames);

  return (
    <View style={[styles.summary, style]} testID="token-plan-summary">
      <Text style={styles.title}>{labels.tokenPlanIncludes}</Text>

      <Text style={styles.tier}>
        {grant.appTierName ?? grant.appTierId}
        {grant.pricingName ? <Text style={styles.pricing}>{` (${grant.pricingName})`}</Text> : null}
      </Text>

      {packs.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>{labels.tokenPlanPacks}</Text>
          {packs.map((entry) => (
            <Text style={styles.item} key={entry.id}>
              {entry.name}
            </Text>
          ))}
        </View>
      ) : null}

      {features.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>{labels.tokenPlanFeatures}</Text>
          {features.map((entry) => (
            <Text style={styles.item} key={entry.id}>
              {entry.name}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 16,
    gap: 8,
    marginBottom: 16,
  },
  title: { fontSize: 15, fontWeight: '700', color: '#1E3A8A' },
  tier: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  pricing: { fontSize: 14, fontWeight: '400', color: '#666' },
  group: { gap: 2 },
  groupTitle: { fontSize: 13, fontWeight: '600', color: '#1D4ED8' },
  item: { fontSize: 14, color: '#333' },
});
