import type { AppTierModel, AppTierPricingModel } from './types.js';

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '\u20AC',
  GBP: '\u00A3',
  JPY: '\u00A5',
  INR: '\u20B9',
  CAD: 'CA$',
  AUD: 'A$',
};

export function getCurrencySymbol(currency?: string): string {
  if (!currency) return '$';
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? '$';
}

export function formatPrice(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '$';
  return currency === 'JPY' ? `${symbol}${Math.round(amount)}` : `${symbol}${amount.toFixed(2)}`;
}

/** Returns true if a billing frequency string represents an annual cycle. */
export function isAnnualFrequency(freq: string | undefined | null): boolean {
  if (!freq) return false;
  const lower = freq.toLowerCase();
  return lower === 'yearly' || lower === 'annual' || lower === 'annually';
}

/** Returns true if any tier has an annual pricing option. */
export function hasAnnualPricing(tiers: AppTierModel[]): boolean {
  return tiers.some((t) => t.pricingOptions?.some((p) => isAnnualFrequency(p.billingFrequency)));
}

/** A tier is "enterprise" if it's not free and has no pricing options configured. */
export function isEnterpriseTier(tier: AppTierModel): boolean {
  return !tier.isFreeTier && (!tier.pricingOptions || tier.pricingOptions.length === 0);
}

/** Get the pricing option matching the selected billing cycle. */
export function getSelectedPricing(tier: AppTierModel, billingAnnual: boolean): AppTierPricingModel | undefined {
  if (!tier.pricingOptions || tier.pricingOptions.length === 0) return undefined;
  if (billingAnnual) {
    const annual = tier.pricingOptions.find((p) => isAnnualFrequency(p.billingFrequency));
    if (annual) return annual;
  } else {
    const monthly = tier.pricingOptions.find((p) => p.billingFrequency?.toLowerCase() === 'monthly');
    if (monthly) return monthly;
  }
  return tier.pricingOptions.find((p) => p.isDefault) ?? tier.pricingOptions[0];
}

/** Compute the percentage discount for annual billing vs monthly. Returns null if not applicable. */
export function computeAnnualDiscount(tier: AppTierModel): number | null {
  if (!tier.pricingOptions || tier.pricingOptions.length < 2) return null;
  const monthly = tier.pricingOptions.find((p) => p.billingFrequency?.toLowerCase() === 'monthly');
  const annual = tier.pricingOptions.find((p) => isAnnualFrequency(p.billingFrequency));
  if (!monthly || !annual || monthly.price <= 0) return null;
  const monthlyTotal = monthly.price * 12;
  if (annual.price < monthlyTotal) {
    return Math.round(((monthlyTotal - annual.price) / monthlyTotal) * 100);
  }
  return null;
}
