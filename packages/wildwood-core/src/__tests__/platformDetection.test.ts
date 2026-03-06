import { describe, it, expect } from 'vitest';
import { detectPlatform } from '../platform/platformDetection.js';

describe('detectPlatform', () => {
  it('returns a PlatformInfo object with all required fields', () => {
    const info = detectPlatform();

    expect(info).toHaveProperty('platform');
    expect(info).toHaveProperty('isBrowser');
    expect(info).toHaveProperty('isMobile');
    expect(info).toHaveProperty('isDesktop');
    expect(info).toHaveProperty('userAgent');
    expect(info).toHaveProperty('language');
  });

  it('returns valid platform type', () => {
    const info = detectPlatform();
    const validPlatforms = ['web', 'ios', 'android', 'macos', 'windows', 'unknown'];
    expect(validPlatforms).toContain(info.platform);
  });

  it('returns boolean values for detection flags', () => {
    const info = detectPlatform();
    expect(typeof info.isBrowser).toBe('boolean');
    expect(typeof info.isMobile).toBe('boolean');
    expect(typeof info.isDesktop).toBe('boolean');
  });

  it('returns string values for userAgent and language', () => {
    const info = detectPlatform();
    expect(typeof info.userAgent).toBe('string');
    expect(typeof info.language).toBe('string');
  });

  it('isMobile and isDesktop are consistent', () => {
    const info = detectPlatform();
    // In non-browser env both should be false
    // In browser env they should be mutually exclusive
    if (info.isBrowser) {
      expect(info.isMobile).not.toBe(info.isDesktop);
    } else {
      expect(info.isMobile).toBe(false);
      expect(info.isDesktop).toBe(false);
    }
  });
});
