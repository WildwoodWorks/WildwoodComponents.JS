// Platform detection - browser/OS/device info
// Mirrors WildwoodComponents.Blazor/Services/PlatformDetectionService.cs

import type { Platform, PlatformInfo, DistributionSource } from './types.js';
import { PaymentProviderType } from '../payment/types.js';

export function detectPlatform(): PlatformInfo {
  if (typeof navigator === 'undefined') {
    return {
      platform: 'unknown',
      isMobile: false,
      isDesktop: false,
      isBrowser: false,
      userAgent: '',
      language: '',
      distributionSource: 'unknown',
      requiresAppStorePayment: false,
      supportsApplePay: false,
      supportsGooglePay: false,
    };
  }

  const ua = navigator.userAgent;
  const platform = detectOS(ua);
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const distributionSource = detectDistributionSource(platform);

  return {
    platform,
    isBrowser: true,
    isDesktop: !isMobile,
    isMobile,
    userAgent: ua,
    language: navigator.language ?? '',
    distributionSource,
    requiresAppStorePayment: distributionSource === 'apple-app-store' || distributionSource === 'google-play-store',
    supportsApplePay: platform === 'ios' || platform === 'macos',
    supportsGooglePay: platform === 'android' || platform === 'web' || platform === 'windows',
  };
}

function detectOS(ua: string): Platform {
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Mac/.test(ua)) return 'macos';
  if (/Win/.test(ua)) return 'windows';
  return 'unknown';
}

/**
 * Detect if the app is running from an app store or as a regular web app.
 * In a browser context this is always 'web-browser' unless running in a PWA/TWA.
 */
function detectDistributionSource(platform: Platform): DistributionSource {
  if (typeof window === 'undefined') return 'unknown';

  // Check for standalone PWA mode (installed from browser)
  const isStandalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as { standalone?: boolean }).standalone === true;

  // Check for Trusted Web Activity (Android TWA from Play Store)
  if (typeof document !== 'undefined' && platform === 'android' && document.referrer.includes('android-app://')) {
    return 'google-play-store';
  }

  if (isStandalone) {
    // PWA on iOS could be from App Store or home screen
    if (platform === 'ios') return 'apple-app-store';
    if (platform === 'android') return 'google-play-store';
    return 'web-browser';
  }

  return 'web-browser';
}

/**
 * Check if a payment provider is available on the current platform.
 * Mirrors Blazor's PlatformDetectionService.IsProviderAvailable().
 */
export function isProviderAvailable(providerType: PaymentProviderType, platformInfo?: PlatformInfo): boolean {
  const info = platformInfo ?? detectPlatform();

  // If platform requires app store payment, only the required provider is available
  // (matches Blazor's exclusive provider enforcement)
  if (info.requiresAppStorePayment) {
    const requiredProvider = getRequiredAppStoreProviderType(info);
    if (requiredProvider !== null && providerType !== requiredProvider) {
      return false;
    }
  }

  switch (providerType) {
    case PaymentProviderType.AppleAppStore:
      return info.platform === 'ios' || info.platform === 'macos';
    case PaymentProviderType.GooglePlayStore:
      return info.platform === 'android';
    case PaymentProviderType.ApplePay:
      return info.supportsApplePay;
    case PaymentProviderType.GooglePay:
      return info.supportsGooglePay;
    // Standard web payment providers are available on all platforms
    case PaymentProviderType.Stripe:
    case PaymentProviderType.PayPal:
    case PaymentProviderType.Square:
    case PaymentProviderType.Braintree:
    case PaymentProviderType.AuthorizeNet:
    case PaymentProviderType.Klarna:
    case PaymentProviderType.Affirm:
    case PaymentProviderType.Afterpay:
    case PaymentProviderType.Razorpay:
    case PaymentProviderType.Adyen:
    case PaymentProviderType.Coinbase:
    case PaymentProviderType.BitPay:
      return true;
    default:
      return false;
  }
}

/**
 * Get the required app store provider type if the platform requires app store payments.
 * Returns null if no app store payment is required.
 */
export function getRequiredAppStoreProviderType(platformInfo?: PlatformInfo): PaymentProviderType | null {
  const info = platformInfo ?? detectPlatform();
  if (info.distributionSource === 'apple-app-store') return PaymentProviderType.AppleAppStore;
  if (info.distributionSource === 'google-play-store') return PaymentProviderType.GooglePlayStore;
  return null;
}

/**
 * Check if Apple Pay is available in the browser.
 * Uses the Apple Pay JS API when available.
 */
export async function isApplePayAvailableAsync(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const ApplePaySession = (window as { ApplePaySession?: { canMakePayments?: () => boolean } }).ApplePaySession;
  if (ApplePaySession?.canMakePayments) {
    try {
      return ApplePaySession.canMakePayments();
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Check if Google Pay is available in the browser.
 * Uses the Payment Request API when available.
 */
export async function isGooglePayAvailableAsync(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (typeof PaymentRequest === 'undefined') return false;
  try {
    const supportedMethods = [{ supportedMethods: 'https://google.com/pay' }];
    const details = { total: { label: 'Google Pay check', amount: { currency: 'USD', value: '0.00' } } };
    const request = new PaymentRequest(supportedMethods, details);
    return (await request.canMakePayment()) ?? false;
  } catch {
    return false;
  }
}
