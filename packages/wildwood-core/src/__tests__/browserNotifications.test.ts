import { describe, it, expect } from 'vitest';
import {
  isBrowserNotificationSupported,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  showBrowserNotification,
} from '../notifications/browserNotifications.js';

// The core vitest environment is Node (no window / Notification), so these assert the
// safe "unsupported" degradation path. Behavior with a real Notification API is covered
// by the react package's jsdom-based tests / manual verification.
describe('browserNotifications (unsupported environment)', () => {
  it('reports unsupported when the Web Notifications API is absent', () => {
    expect(isBrowserNotificationSupported()).toBe(false);
    expect(getBrowserNotificationPermission()).toBe('unsupported');
  });

  it('requestBrowserNotificationPermission resolves to unsupported', async () => {
    await expect(requestBrowserNotificationPermission()).resolves.toBe('unsupported');
  });

  it('showBrowserNotification is a no-op that never throws', () => {
    expect(() => showBrowserNotification('Hello', { body: 'World', tag: 'x' })).not.toThrow();
  });
});
