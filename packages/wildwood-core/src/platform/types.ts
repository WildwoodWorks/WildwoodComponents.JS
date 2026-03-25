// Platform and storage types

export type Platform = 'web' | 'ios' | 'android' | 'macos' | 'windows' | 'unknown';

export type DistributionSource =
  | 'apple-app-store'
  | 'google-play-store'
  | 'microsoft-store'
  | 'mac-app-store'
  | 'web-browser'
  | 'sideloaded'
  | 'development'
  | 'unknown';

export interface PlatformInfo {
  platform: Platform;
  isMobile: boolean;
  isDesktop: boolean;
  isBrowser: boolean;
  userAgent: string;
  language: string;
  /** Where the app was installed from */
  distributionSource: DistributionSource;
  /** Whether the platform requires in-app purchase (e.g. iOS App Store) */
  requiresAppStorePayment: boolean;
  /** Whether the platform supports Apple Pay */
  supportsApplePay: boolean;
  /** Whether the platform supports Google Pay */
  supportsGooglePay: boolean;
}

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}
