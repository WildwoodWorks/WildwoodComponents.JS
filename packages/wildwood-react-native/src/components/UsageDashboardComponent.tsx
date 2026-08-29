import { useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AppTierLimitStatusModel, UserTierSubscriptionModel } from '@wildwood/core';
import { useUsageDashboard } from '../hooks/useUsageDashboard';
import type { UseUsageDashboardOptions } from '../hooks/useUsageDashboard';
import { useWildwoodTheme } from '../styles/ThemeContext';
import type { WildwoodTheme } from '../styles/theme';

export interface UsageDashboardComponentProps {
  title?: string;
  subtitle?: string;
  showOverageInfo?: boolean;
  warningThreshold?: number;
  onUpgradeClick?: () => void;
  style?: ViewStyle;
  /**
   * Override limit statuses instead of fetching from the Wildwood API.
   * When provided, the internal useUsageDashboard() hook is still called
   * but its limitStatuses are replaced with this value.
   */
  limitStatuses?: AppTierLimitStatusModel[];
  /**
   * Override subscription instead of fetching from the Wildwood API.
   * When provided, replaces the internal hook's subscription data.
   */
  subscription?: UserTierSubscriptionModel | null;
  /**
   * Options passed to the internal useUsageDashboard() hook.
   * Use this to configure refreshInterval or onMergeUsage callback.
   */
  usageDashboardOptions?: UseUsageDashboardOptions;
}

/* The usage bar's traffic-light colours come from the theme like everything else — takes the theme
   rather than closing over one so it stays a pure function. */
function getBarColor(percent: number, isExceeded: boolean, warningThreshold: number, theme: WildwoodTheme): string {
  if (isExceeded) return theme.danger;
  if (percent >= warningThreshold) return theme.warning;
  return theme.success;
}

export function UsageDashboardComponent({
  title,
  subtitle,
  showOverageInfo = true,
  warningThreshold = 80,
  onUpgradeClick,
  style,
  limitStatuses: limitStatusesOverride,
  subscription: subscriptionOverride,
  usageDashboardOptions,
}: UsageDashboardComponentProps) {
  const theme = useWildwoodTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const hook = useUsageDashboard(usageDashboardOptions);

  const limitStatuses = limitStatusesOverride ?? hook.limitStatuses;
  const subscription = subscriptionOverride !== undefined ? subscriptionOverride : hook.subscription;
  const { loading, error, refresh } = hook;

  const anyAtWarning = limitStatuses.some((s) => s.usagePercent >= warningThreshold || s.isExceeded);
  const anyOverage = limitStatuses.some((s) => s.isExceeded && !s.isHardBlocked);

  if (loading && limitStatuses.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={styles.loadingText}>Loading usage data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, style]} contentContainerStyle={styles.content}>
      {title || subtitle || subscription ? (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {subscription ? (
            <View
              style={[styles.tierBadge, subscription.isFreeTier ? styles.tierBadgeSecondary : styles.tierBadgePrimary]}
            >
              <Text
                style={[
                  styles.tierBadgeText,
                  subscription.isFreeTier ? styles.tierBadgeTextSecondary : styles.tierBadgeTextPrimary,
                ]}
              >
                {subscription.tierName}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {limitStatuses.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No usage limits configured for your current plan.</Text>
        </View>
      ) : (
        <View style={styles.limitsContainer}>
          {limitStatuses.map((status) => {
            const percent = status.isUnlimited ? 0 : Math.min(status.usagePercent, 100);
            const barColor = getBarColor(status.usagePercent, status.isExceeded, warningThreshold, theme);

            return (
              <View key={status.limitCode} style={styles.limitItem}>
                <View style={styles.limitHeader}>
                  <Text style={styles.limitLabel}>
                    {status.displayName}
                    {status.unit ? ` (${status.unit})` : ''}
                  </Text>
                  <Text style={styles.limitValue}>
                    {status.currentUsage.toLocaleString()} /{' '}
                    {status.isUnlimited ? 'Unlimited' : status.maxValue.toLocaleString()}
                    {!status.isUnlimited ? ` (${Math.round(status.usagePercent)}%)` : ''}
                  </Text>
                </View>

                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${status.isUnlimited ? 100 : percent}%`,
                        backgroundColor: status.isUnlimited ? theme.infoLight : barColor,
                      },
                    ]}
                  />
                </View>

                {showOverageInfo && status.isExceeded && !status.isHardBlocked ? (
                  <Text style={styles.overageText}>
                    {'\u26A0'} Overage: {(status.currentUsage - status.maxValue).toLocaleString()} over limit
                  </Text>
                ) : null}

                {status.isExceeded && status.isHardBlocked ? (
                  <Text style={styles.blockedText}>{'\u26D4'} Limit reached</Text>
                ) : null}

                {status.statusMessage ? <Text style={styles.statusMessage}>{status.statusMessage}</Text> : null}
              </View>
            );
          })}
        </View>
      )}

      {anyAtWarning && onUpgradeClick ? (
        <View style={styles.upgradeCta}>
          <Text style={styles.upgradeMessage}>
            {anyOverage ? 'You have exceeded one or more usage limits.' : 'You are approaching your usage limits.'}
          </Text>
          <Pressable style={styles.upgradeButton} onPress={onUpgradeClick}>
            <Text style={styles.upgradeButtonText}>Upgrade Plan</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

/* Built from the active theme rather than at module scope, so the token vocabulary the web
   exposes as `--ww-*` reaches this component too. `#000` stays literal: it is a shadow, not a
   themeable colour. */
const createStyles = (theme: WildwoodTheme) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 16 },
    loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
    loadingText: { marginTop: 12, fontSize: 14, color: theme.textMuted },
    errorContainer: {
      padding: 16,
      backgroundColor: theme.dangerBg,
      borderRadius: theme.borderRadius,
      margin: 16,
      alignItems: 'center',
    },
    errorText: { color: theme.dangerText, fontSize: 14, marginBottom: 12 },
    retryButton: {
      borderWidth: 1,
      borderColor: theme.dangerText,
      borderRadius: theme.borderRadius,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    retryButtonText: { color: theme.dangerText, fontSize: 14, fontWeight: '600' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    headerText: { flex: 1 },
    title: { fontSize: 20, fontWeight: '700', color: theme.textPrimary, marginBottom: 2 },
    subtitle: { fontSize: 14, color: theme.textMuted },
    tierBadge: { borderRadius: theme.borderRadius, paddingHorizontal: 10, paddingVertical: 4 },
    tierBadgePrimary: { backgroundColor: theme.infoBg },
    tierBadgeSecondary: { backgroundColor: theme.bgTertiary },
    tierBadgeText: { fontSize: 13, fontWeight: '600' },
    tierBadgeTextPrimary: { color: theme.infoText },
    tierBadgeTextSecondary: { color: theme.textMuted },
    emptyState: { paddingVertical: 24, alignItems: 'center' },
    emptyText: { color: theme.textMuted, fontSize: 14 },
    limitsContainer: { gap: 16 },
    limitItem: {
      backgroundColor: theme.bgPrimary,
      borderRadius: theme.borderRadiusLg,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.borderColor,
    },
    limitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    limitLabel: { fontSize: 14, fontWeight: '600', color: theme.textPrimary, flex: 1 },
    limitValue: { fontSize: 13, color: theme.textMuted },
    barTrack: { height: 8, backgroundColor: theme.bgTertiary, borderRadius: theme.borderRadiusSm, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: theme.borderRadiusSm },
    overageText: { color: theme.warningText, fontSize: 12, marginTop: 6 },
    blockedText: { color: theme.danger, fontSize: 12, marginTop: 6, fontWeight: '600' },
    statusMessage: { color: theme.textMuted, fontSize: 12, marginTop: 4 },
    upgradeCta: {
      marginTop: 20,
      backgroundColor: theme.warningBg,
      borderRadius: theme.borderRadiusLg,
      padding: 16,
      alignItems: 'center',
    },
    upgradeMessage: { color: theme.warningText, fontSize: 14, textAlign: 'center', marginBottom: 12 },
    upgradeButton: {
      backgroundColor: theme.primaryDark,
      borderRadius: theme.borderRadius,
      paddingVertical: 12,
      paddingHorizontal: 24,
    },
    upgradeButtonText: { color: theme.btnPrimaryText, fontSize: 16, fontWeight: '600' },
  });
