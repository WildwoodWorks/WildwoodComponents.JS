import { View, Text, Pressable, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useUsageDashboard } from '../hooks/useUsageDashboard';

export interface UsageDashboardComponentProps {
  title?: string;
  subtitle?: string;
  showOverageInfo?: boolean;
  warningThreshold?: number;
  onUpgradeClick?: () => void;
  style?: ViewStyle;
}

function getBarColor(percent: number, isExceeded: boolean, warningThreshold: number): string {
  if (isExceeded) return '#EF4444';
  if (percent >= warningThreshold) return '#F59E0B';
  return '#22C55E';
}

export function UsageDashboardComponent({
  title,
  subtitle,
  showOverageInfo = true,
  warningThreshold = 80,
  onUpgradeClick,
  style,
}: UsageDashboardComponentProps) {
  const { limitStatuses, subscription, loading, error, refresh } = useUsageDashboard();

  const anyAtWarning = limitStatuses.some((s) => s.usagePercent >= warningThreshold || s.isExceeded);
  const anyOverage = limitStatuses.some((s) => s.isExceeded && !s.isHardBlocked);

  if (loading && limitStatuses.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
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
            const barColor = getBarColor(status.usagePercent, status.isExceeded, warningThreshold);

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
                        backgroundColor: status.isUnlimited ? '#93C5FD' : barColor,
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#666' },
  errorContainer: { padding: 16, backgroundColor: '#FEE2E2', borderRadius: 8, margin: 16, alignItems: 'center' },
  errorText: { color: '#991B1B', fontSize: 14, marginBottom: 12 },
  retryButton: { borderWidth: 1, borderColor: '#991B1B', borderRadius: 6, paddingHorizontal: 16, paddingVertical: 8 },
  retryButtonText: { color: '#991B1B', fontSize: 14, fontWeight: '600' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 2 },
  subtitle: { fontSize: 14, color: '#666' },
  tierBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  tierBadgePrimary: { backgroundColor: '#DBEAFE' },
  tierBadgeSecondary: { backgroundColor: '#F3F4F6' },
  tierBadgeText: { fontSize: 13, fontWeight: '600' },
  tierBadgeTextPrimary: { color: '#1D4ED8' },
  tierBadgeTextSecondary: { color: '#6B7280' },
  emptyState: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 14 },
  limitsContainer: { gap: 16 },
  limitItem: { backgroundColor: '#fff', borderRadius: 10, padding: 16, borderWidth: 1, borderColor: '#eee' },
  limitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  limitLabel: { fontSize: 14, fontWeight: '600', color: '#333', flex: 1 },
  limitValue: { fontSize: 13, color: '#666' },
  barTrack: { height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  overageText: { color: '#D97706', fontSize: 12, marginTop: 6 },
  blockedText: { color: '#EF4444', fontSize: 12, marginTop: 6, fontWeight: '600' },
  statusMessage: { color: '#999', fontSize: 12, marginTop: 4 },
  upgradeCta: { marginTop: 20, backgroundColor: '#FEF3C7', borderRadius: 10, padding: 16, alignItems: 'center' },
  upgradeMessage: { color: '#92400E', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  upgradeButton: { backgroundColor: '#007AFF', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24 },
  upgradeButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
