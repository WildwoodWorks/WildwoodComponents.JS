import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierModel } from '@wildwood/core';

export interface TierCardFooterProps {
  tier: AppTierModel;
  isEnterprise: boolean;
  isCurrent?: boolean;
  isPreSelected?: boolean;
  hasSubscription?: boolean;
  enterpriseContactUrl?: string;
  disabled?: boolean;
  processingText?: string;
  onSelect?: (tier: AppTierModel) => void;
  style?: ViewStyle;
}

export function TierCardFooter({
  tier,
  isEnterprise,
  isCurrent,
  isPreSelected,
  hasSubscription,
  enterpriseContactUrl,
  disabled,
  processingText,
  onSelect,
  style,
}: TierCardFooterProps) {
  if (isCurrent) {
    return (
      <View style={[styles.footer, style]}>
        <View style={styles.currentBadge}>
          <Text style={styles.currentBadgeText}>Current Plan</Text>
        </View>
      </View>
    );
  }

  // Tier explicitly configured with contact button
  if (tier.showContactButton && tier.contactButtonUrl) {
    return (
      <View style={[styles.footer, style]}>
        <Pressable
          style={[styles.outlineButton, disabled && styles.buttonDisabled]}
          onPress={() => {
            if (tier.contactButtonUrl) {
              Linking.openURL(tier.contactButtonUrl).catch((err) => console.warn('Failed to open contact URL:', err));
            }
          }}
          disabled={disabled}
        >
          <Text style={styles.outlineButtonText}>Contact Us</Text>
        </Pressable>
      </View>
    );
  }

  // Enterprise tier with fallback contact URL
  if (isEnterprise && enterpriseContactUrl) {
    return (
      <View style={[styles.footer, style]}>
        <Pressable
          style={[styles.outlineButton, disabled && styles.buttonDisabled]}
          onPress={() => {
            Linking.openURL(enterpriseContactUrl).catch((err) =>
              console.warn('Failed to open enterprise contact URL:', err),
            );
          }}
          disabled={disabled}
        >
          <Text style={styles.outlineButtonText}>Contact Sales</Text>
        </Pressable>
      </View>
    );
  }

  // Enterprise tier without URL
  if (isEnterprise) {
    return (
      <View style={[styles.footer, style]}>
        <Pressable
          style={[styles.outlineButton, disabled && styles.buttonDisabled]}
          onPress={() => onSelect?.(tier)}
          disabled={disabled}
        >
          <Text style={styles.outlineButtonText}>{processingText ?? 'Contact Sales'}</Text>
        </Pressable>
      </View>
    );
  }

  // Normal subscribe/select button
  if (tier.showSubscribeButton !== false) {
    const buttonText = processingText
      ? processingText
      : isPreSelected
        ? 'Continue with This Plan'
        : tier.isFreeTier
          ? hasSubscription
            ? 'Get Started Free'
            : 'Get Started'
          : hasSubscription
            ? `Switch to ${tier.name}`
            : 'Subscribe';

    const isPrimary = isPreSelected || tier.isDefault;

    return (
      <View style={[styles.footer, style]}>
        <Pressable
          style={[isPrimary ? styles.primaryButton : styles.outlineButton, disabled && styles.buttonDisabled]}
          onPress={() => onSelect?.(tier)}
          disabled={disabled}
        >
          <Text style={isPrimary ? styles.primaryButtonText : styles.outlineButtonText}>{buttonText}</Text>
        </Pressable>
      </View>
    );
  }

  return <View style={[styles.footer, style]} />;
}

const styles = StyleSheet.create({
  footer: { marginTop: 4 },
  currentBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  currentBadgeText: { color: '#166534', fontSize: 14, fontWeight: '600' },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  outlineButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  outlineButtonText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
});
