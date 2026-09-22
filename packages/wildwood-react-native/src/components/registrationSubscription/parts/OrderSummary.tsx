// What the packs in the basket cost, as the server just quoted them.
//
// Every figure is off the quote: its lines, its currency, its per-line trial and its total due
// today. Nothing is added up here - the server owns the arithmetic, because it is the one that will
// charge the card.

import { View, Text, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AddOnCheckoutQuoteModel } from '@wildwood/core';
import { formatMoney, trialLabel } from '@wildwood/core';
import {
  formatRegistrationSubscriptionLabel as formatLabel,
  type RegistrationSubscriptionLabels,
} from '@wildwood/react-shared';
import { wwPackTestId } from '../testIds';

export interface OrderSummaryProps {
  /** A successful quote. */
  quote: AddOnCheckoutQuoteModel;
  labels: RegistrationSubscriptionLabels;
  style?: ViewStyle;
}

export function OrderSummary({ quote, labels, style }: OrderSummaryProps) {
  const currency = quote.currency;

  return (
    <View style={[styles.card, style]} testID="order-summary">
      <Text style={styles.title}>{labels.orderSummary}</Text>

      {quote.lines.map((line) => {
        const trial = line.trialEligible ? trialLabel(line.trialDays) : '';
        return (
          <View style={styles.line} key={`${line.addOnId}:${line.pricingId}`} testID={wwPackTestId(line.addOnId)}>
            <Text style={styles.name}>{line.name}</Text>
            <View style={styles.priceColumn}>
              <Text style={styles.price}>{formatMoney(line.price, currency)}</Text>
              {trial ? <Text style={styles.trial}>{trial}</Text> : null}
            </View>
          </View>
        );
      })}

      <View style={styles.total}>
        <Text style={styles.totalLabel}>{labels.dueToday}</Text>
        <Text style={styles.totalAmount}>{formatMoney(quote.totalDueToday, currency)}</Text>
      </View>

      {quote.savedCard ? (
        <Text style={styles.savedCard}>
          {formatLabel(labels.savedCardOnFile, {
            brand: quote.savedCard.brand ?? '',
            last4: quote.savedCard.last4 ?? '',
          })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 8,
    marginBottom: 16,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  name: { flex: 1, fontSize: 14, color: '#333' },
  priceColumn: { alignItems: 'flex-end' },
  price: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  trial: { fontSize: 12, fontWeight: '600', color: '#166534' },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
  },
  totalLabel: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  totalAmount: { fontSize: 16, fontWeight: '700', color: '#007AFF' },
  savedCard: { fontSize: 13, color: '#666' },
});
