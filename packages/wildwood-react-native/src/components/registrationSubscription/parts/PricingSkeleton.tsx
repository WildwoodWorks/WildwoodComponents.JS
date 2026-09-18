// The placeholder shown while the live catalog loads.
//
// Blocks, never numbers. A skeleton that shows a price - a remembered one, a "from" price, a zero -
// is a price the visitor may act on and the server never quoted, so there is nothing here to read
// but shapes. The only text is what a screen reader is told.

import { View, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';

export interface PricingSkeletonProps {
  /** How many placeholder cards to draw. */
  cards?: number;
  /** What a screen reader hears while the prices load. */
  label: string;
  style?: ViewStyle;
}

export function PricingSkeleton({ cards = 3, label, style }: PricingSkeletonProps) {
  return (
    <View
      style={[styles.skeleton, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      testID="pricing-skeleton"
    >
      {Array.from({ length: cards }, (_, index) => (
        <View key={index} style={styles.block} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { gap: 16 },
  block: { height: 180, borderRadius: 12, backgroundColor: '#ECEFF1' },
});
