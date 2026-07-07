'use client';

// Notification delivery preferences: email / SMS / push / browser opt-out toggles
// bound to useNotificationPreferences. Each toggle persists immediately via save();
// on save failure the optimistic draft is rolled back so the UI never shows a value
// that was never persisted.
//
// The browser toggle is web-only and gated on the Web Notifications permission: turning
// it on prompts for permission and only persists browserEnabled=true when granted.

import { useEffect, useState, useCallback } from 'react';
import type { UserNotificationPreference } from '@wildwood/core';
import {
  useNotificationPreferences,
  type UseNotificationPreferencesOptions,
} from '../../hooks/useNotificationPreferences.js';
import { useBrowserNotifications } from '../../hooks/useBrowserNotifications.js';

export interface NotificationPreferencesProps {
  /** App whose preferences are managed. */
  appId: string;
  /** Options forwarded to the underlying hook (API base override). */
  options?: UseNotificationPreferencesOptions;
  /** Show the push toggle. On native this is governed by the OS; on web it defaults to shown. */
  showPush?: boolean;
  /** Show the browser (Web Notifications API) toggle. Default true. */
  showBrowser?: boolean;
  className?: string;
}

type Channel = 'emailEnabled' | 'smsEnabled' | 'pushEnabled';

const DEFAULT_PREF = (appId: string): UserNotificationPreference => ({
  appId,
  emailEnabled: true,
  smsEnabled: false,
  pushEnabled: false,
  browserEnabled: false,
  eventOptOutsJson: null,
});

export function NotificationPreferences({
  appId,
  options,
  showPush = true,
  showBrowser = true,
  className,
}: NotificationPreferencesProps) {
  const { preferences, loading, error, save } = useNotificationPreferences(appId, options);
  const { supported: browserSupported, permission, request: requestBrowserPermission } = useBrowserNotifications();
  const [draft, setDraft] = useState<UserNotificationPreference>(() => DEFAULT_PREF(appId));
  const [saving, setSaving] = useState(false);
  const [browserHint, setBrowserHint] = useState<string | null>(null);

  useEffect(() => {
    if (preferences) setDraft(preferences);
  }, [preferences]);

  // Optimistic persist with rollback: apply `next`, save, and revert to the previous
  // draft if save() reports failure (returns null / throws). Returns success.
  const persist = useCallback(
    async (next: UserNotificationPreference): Promise<boolean> => {
      const previous = draft;
      setDraft(next);
      setSaving(true);
      try {
        const saved = await save(next);
        if (!saved) {
          setDraft(previous);
          return false;
        }
        return true;
      } catch {
        setDraft(previous);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [draft, save],
  );

  const toggleChannel = useCallback(
    (channel: Channel) => void persist({ ...draft, [channel]: !draft[channel] }),
    [draft, persist],
  );

  const toggleBrowser = useCallback(async () => {
    setBrowserHint(null);
    // Branch on the DISPLAYED checkbox state, not the raw stored pref. If browserEnabled
    // was persisted true but the permission was later revoked, the box renders unchecked,
    // so a click means "turn ON" (re-request permission) — not a silent "turn OFF".
    const shown = Boolean(draft.browserEnabled) && permission === 'granted';
    if (shown) {
      await persist({ ...draft, browserEnabled: false });
      return;
    }
    // Turning ON requires an explicit permission grant.
    const result = await requestBrowserPermission();
    if (result === 'granted') {
      await persist({ ...draft, browserEnabled: true });
    } else {
      // Keep it off; surface why.
      setBrowserHint(
        result === 'denied' ? 'Blocked in your browser settings' : 'Browser notifications were not enabled',
      );
    }
  }, [draft, permission, persist, requestBrowserPermission]);

  if (loading) {
    return <div className={`ww-notification-prefs ${className ?? ''}`}>Loading preferences…</div>;
  }

  const rows: { channel: Channel; label: string }[] = [
    { channel: 'emailEnabled', label: 'Email notifications' },
    { channel: 'smsEnabled', label: 'SMS notifications' },
  ];
  if (showPush) {
    rows.push({ channel: 'pushEnabled', label: 'Push notifications' });
  }

  const browserPermissionLabel =
    permission === 'granted'
      ? 'Allowed'
      : permission === 'denied'
        ? 'Blocked'
        : permission === 'unsupported'
          ? 'Not supported'
          : 'Not yet allowed';

  return (
    <div className={`ww-notification-prefs ${className ?? ''}`}>
      <div className="ww-notification-prefs-header">
        <h4 className="ww-notification-prefs-title">Notification Preferences</h4>
        {saving && <span className="ww-notification-prefs-saving">Saving…</span>}
      </div>

      {error && <div className="ww-alert ww-alert-danger">{error}</div>}

      <ul className="ww-notification-prefs-list">
        {rows.map(({ channel, label }) => (
          <li key={channel} className="ww-notification-prefs-row">
            <label className="ww-notification-prefs-label">
              <span>{label}</span>
              <input
                type="checkbox"
                className="ww-notification-prefs-toggle"
                checked={Boolean(draft[channel])}
                onChange={() => toggleChannel(channel)}
                disabled={saving}
              />
            </label>
          </li>
        ))}

        {showBrowser && (
          <li className="ww-notification-prefs-row">
            <label className="ww-notification-prefs-label">
              <span>
                Browser notifications
                <span className="ww-notification-prefs-hint">
                  Permission: {browserPermissionLabel}
                  {browserHint ? ` — ${browserHint}` : ''}
                </span>
              </span>
              <input
                type="checkbox"
                className="ww-notification-prefs-toggle"
                checked={Boolean(draft.browserEnabled) && permission === 'granted'}
                onChange={() => void toggleBrowser()}
                disabled={saving || !browserSupported}
              />
            </label>
          </li>
        )}
      </ul>
    </div>
  );
}
