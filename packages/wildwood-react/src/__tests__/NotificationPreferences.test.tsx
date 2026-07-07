import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act, waitFor, fireEvent } from '@testing-library/react';
import type { UserNotificationPreference } from '@wildwood/core';
import { NotificationPreferences } from '../components/notifications/NotificationPreferences.js';
import { createTestClient, createWrapper } from './testUtils.js';

// smsEnabled:true differs from DEFAULT_PREF (false), so the SMS checkbox flipping to
// checked is a reliable signal that the loaded pref (incl. browserEnabled:true) has
// propagated into the component's draft.
const storedPref: UserNotificationPreference = {
  appId: 'test-app-id',
  emailEnabled: true,
  smsEnabled: true,
  pushEnabled: false,
  browserEnabled: true, // persisted ON...
  eventOptOutsJson: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { Notification?: unknown }).Notification;
});

function checkboxes(container: HTMLElement): HTMLInputElement[] {
  return Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
}
// Row order: email, sms, push, browser.
const smsBox = (c: HTMLElement) => checkboxes(c)[1];
const browserBox = (c: HTMLElement) => checkboxes(c)[checkboxes(c).length - 1];

describe('NotificationPreferences browser toggle', () => {
  it('re-requests permission (not silent-off) when the pref is true but permission was revoked', async () => {
    // Permission was granted at save time but has since been revoked to 'denied'.
    const requestPermission = vi.fn(async () => 'denied');
    class MockNotification {
      static permission = 'denied';
      static requestPermission = requestPermission;
    }
    (window as unknown as { Notification: unknown }).Notification = MockNotification;

    const client = createTestClient();
    vi.spyOn(client.notificationInbox, 'getPreferences').mockResolvedValue(storedPref);
    const updateSpy = vi.spyOn(client.notificationInbox, 'updatePreferences').mockImplementation(async (p) => p);

    const { container } = render(<NotificationPreferences appId="test-app-id" />, {
      wrapper: createWrapper(client),
    });
    // Wait until the loaded pref (browserEnabled:true) has propagated into the draft.
    await waitFor(() => expect(smsBox(container).checked).toBe(true));
    // Displayed unchecked: persisted true AND permission !== 'granted'.
    expect(browserBox(container).checked).toBe(false);

    await act(async () => {
      fireEvent.click(browserBox(container));
    });

    // Single click took the "turn ON" branch: it re-requested permission...
    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
    // ...and did NOT silently persist browserEnabled=false.
    expect(updateSpy).not.toHaveBeenCalled();
    // The denial reason is surfaced.
    expect(container.textContent).toContain('Blocked in your browser settings');
  });

  it('turns OFF when the box is actually shown checked (permission granted)', async () => {
    const requestPermission = vi.fn(async () => 'granted');
    class MockNotification {
      static permission = 'granted';
      static requestPermission = requestPermission;
    }
    (window as unknown as { Notification: unknown }).Notification = MockNotification;

    const client = createTestClient();
    vi.spyOn(client.notificationInbox, 'getPreferences').mockResolvedValue(storedPref);
    const updateSpy = vi.spyOn(client.notificationInbox, 'updatePreferences').mockImplementation(async (p) => p);

    const { container } = render(<NotificationPreferences appId="test-app-id" />, {
      wrapper: createWrapper(client),
    });
    // Displayed checked once loaded: persisted true AND permission granted.
    await waitFor(() => expect(browserBox(container).checked).toBe(true));

    await act(async () => {
      fireEvent.click(browserBox(container));
    });

    // Turning off must NOT re-prompt, and must persist browserEnabled=false.
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ browserEnabled: false }), expect.anything()),
    );
    expect(requestPermission).not.toHaveBeenCalled();
  });
});
