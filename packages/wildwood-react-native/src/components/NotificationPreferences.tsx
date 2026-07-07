// Notification delivery preferences for React Native. Manages the email and SMS
// opt-outs (persisted immediately via save()). Push is governed by the OS
// notification settings, so it is shown as an informational row ("Managed in device
// settings") rather than a toggle that would fight the platform.

import { useEffect, useState, useCallback } from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { UserNotificationPreference } from '@wildwood/core';
import {
  useNotificationPreferences,
  type UseNotificationPreferencesOptions,
} from '../hooks/useNotificationPreferences';

export interface NotificationPreferencesProps {
  /** App whose preferences are managed. */
  appId: string;
  /** Options forwarded to the underlying hook (API base override). */
  options?: UseNotificationPreferencesOptions;
  /** Show the informational "push is device-managed" row. Default true. */
  showPushNotice?: boolean;
  style?: ViewStyle;
}

type Channel = 'emailEnabled' | 'smsEnabled';

const DEFAULT_PREF = (appId: string): UserNotificationPreference => ({
  appId,
  emailEnabled: true,
  smsEnabled: false,
  pushEnabled: false,
  eventOptOutsJson: null,
});

export function NotificationPreferences({
  appId,
  options,
  showPushNotice = true,
  style,
}: NotificationPreferencesProps) {
  const { preferences, loading, error, save } = useNotificationPreferences(appId, options);
  const [draft, setDraft] = useState<UserNotificationPreference>(() => DEFAULT_PREF(appId));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (preferences) setDraft(preferences);
  }, [preferences]);

  const toggle = useCallback(
    async (channel: Channel, value: boolean) => {
      const next = { ...draft, [channel]: value };
      setDraft(next);
      setSaving(true);
      try {
        await save(next);
      } finally {
        setSaving(false);
      }
    },
    [draft, save],
  );

  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.loading}>Loading preferences…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <Text style={styles.title}>Notification Preferences</Text>
        {saving && <Text style={styles.saving}>Saving…</Text>}
      </View>

      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.row}>
        <Text style={styles.label}>Email notifications</Text>
        <Switch value={draft.emailEnabled} onValueChange={(v) => void toggle('emailEnabled', v)} disabled={saving} />
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>SMS notifications</Text>
        <Switch value={draft.smsEnabled} onValueChange={(v) => void toggle('smsEnabled', v)} disabled={saving} />
      </View>

      {showPushNotice && (
        <View style={styles.row}>
          <View style={styles.pushLabelWrap}>
            <Text style={styles.label}>Push notifications</Text>
            <Text style={styles.pushHint}>Managed in device settings</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  saving: {
    fontSize: 12,
    color: '#9ca3af',
  },
  loading: {
    color: '#9ca3af',
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  label: {
    fontSize: 15,
    color: '#111827',
  },
  pushLabelWrap: {
    flex: 1,
  },
  pushHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
});
