// What a visitor sees when an app is not taking registrations.
//
// Its own part for the same reason the web keeps it apart: two very different screens need exactly
// the same words - the signup view when the app's authentication settings say registration is
// closed, and any host that wants to say so on a landing screen without mounting the signup flow.

import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import type { ViewStyle } from 'react-native';

export interface ClosedNoticeProps {
  /** The sentence to show. */
  message: string;
  /** Where a visitor who still wants in should go. Omitted, no link is rendered. */
  contactUrl?: string;
  /** The link's text. */
  contactLabel?: string;
  style?: ViewStyle;
}

export function ClosedNotice({ message, contactUrl, contactLabel, style }: ClosedNoticeProps) {
  return (
    <View style={[styles.notice, style]} accessibilityRole="alert" testID="regsub-closed">
      <Text style={styles.message}>{message}</Text>
      {contactUrl && contactLabel ? (
        <Pressable
          style={styles.outlineButton}
          accessibilityRole="button"
          accessibilityLabel={contactLabel}
          onPress={() => void Linking.openURL(contactUrl)}
        >
          <Text style={styles.outlineButtonText}>{contactLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 12,
  },
  message: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  outlineButtonText: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
});
