'use client';

// The placeholder shown while the live catalog loads.
//
// Blocks, never numbers. A skeleton that shows a price — a remembered one, a "from" price, a zero —
// is a price the visitor may act on and the server never quoted, so there is nothing here to read
// but shapes. The only text is the accessible status message.

export interface PricingSkeletonProps {
  /** How many placeholder cards to draw. */
  cards?: number;
  /** What a screen reader hears while the prices load. */
  label: string;
}

export function PricingSkeleton({ cards = 3, label }: PricingSkeletonProps) {
  return (
    <div className="ww-pricing-skeleton" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} />
      ))}
    </div>
  );
}
