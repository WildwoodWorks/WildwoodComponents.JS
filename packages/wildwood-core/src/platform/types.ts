// Platform and storage types

export type Platform = 'web' | 'ios' | 'android' | 'macos' | 'windows' | 'unknown';

export interface PlatformInfo {
  platform: Platform;
  isMobile: boolean;
  isDesktop: boolean;
  isBrowser: boolean;
  userAgent: string;
  language: string;
}

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}
