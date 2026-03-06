import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, StyleSheet, Alert } from 'react-native';
import { useDisclaimer } from '../hooks/useDisclaimer';

export interface DisclaimerComponentProps {
  /** Called after all disclaimers have been accepted */
  onAllAccepted?: () => void;
  /** Called when a single disclaimer is accepted */
  onDisclaimerAccepted?: (disclaimerId: string) => void;
  /** Whether to auto-load pending disclaimers on mount */
  autoLoad?: boolean;
}

const stripHtml = (html: string): string => {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '  \u2022 ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export function DisclaimerComponent({
  onAllAccepted,
  onDisclaimerAccepted,
  autoLoad = true,
}: DisclaimerComponentProps) {
  const { disclaimers, loading, getPendingDisclaimers, acceptDisclaimer, acceptAllDisclaimers } = useDisclaimer();

  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (autoLoad) {
      getPendingDisclaimers().catch((err) => {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to load disclaimers');
      });
    }
  }, [autoLoad, getPendingDisclaimers]);

  const handleAcceptSingle = useCallback(
    async (disclaimerId: string, versionId: string) => {
      setAccepting(true);
      try {
        await acceptDisclaimer(disclaimerId, versionId);
        onDisclaimerAccepted?.(disclaimerId);
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to accept disclaimer');
      } finally {
        setAccepting(false);
      }
    },
    [acceptDisclaimer, onDisclaimerAccepted],
  );

  const handleAcceptAll = useCallback(async () => {
    if (!disclaimers?.disclaimers?.length) return;
    setAccepting(true);
    try {
      const acceptances = disclaimers.disclaimers.map((d) => ({
        disclaimerId: d.disclaimerId,
        versionId: d.versionId,
      }));
      await acceptAllDisclaimers(acceptances);
      onAllAccepted?.();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to accept disclaimers');
    } finally {
      setAccepting(false);
    }
  }, [disclaimers, acceptAllDisclaimers, onAllAccepted]);

  // Loading state
  if (loading && !disclaimers) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading disclaimers...</Text>
      </View>
    );
  }

  // No pending disclaimers
  if (disclaimers && (!disclaimers.disclaimers || disclaimers.disclaimers.length === 0)) {
    return (
      <View style={styles.centered}>
        <Text style={styles.successIcon}>✓</Text>
        <Text style={styles.successText}>All disclaimers have been accepted.</Text>
      </View>
    );
  }

  if (!disclaimers?.disclaimers) return null;

  const pendingList = disclaimers.disclaimers;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {pendingList.map((d) => (
        <View key={d.disclaimerId} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{d.title}</Text>
            <View style={styles.versionBadge}>
              <Text style={styles.versionBadgeText}>v{d.versionNumber}</Text>
            </View>
          </View>

          <ScrollView style={styles.contentArea} nestedScrollEnabled>
            <Text style={styles.contentText}>{d.contentFormat === 'html' ? stripHtml(d.content) : d.content}</Text>
          </ScrollView>

          <Pressable
            style={[styles.acceptButton, (accepting || loading) && styles.buttonDisabled]}
            onPress={() => handleAcceptSingle(d.disclaimerId, d.versionId)}
            disabled={accepting || loading}
          >
            {accepting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.acceptButtonText}>Accept</Text>
            )}
          </Pressable>
        </View>
      ))}

      {pendingList.length > 1 && (
        <Pressable
          style={[styles.acceptAllButton, (accepting || loading) && styles.buttonDisabled]}
          onPress={handleAcceptAll}
          disabled={accepting || loading}
        >
          {accepting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.acceptAllButtonText}>Accept All ({pendingList.length})</Text>
          )}
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  successIcon: {
    fontSize: 48,
    color: '#22C55E',
    marginBottom: 12,
  },
  successText: {
    fontSize: 16,
    color: '#166534',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
    marginRight: 8,
  },
  versionBadge: {
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  versionBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  contentArea: {
    maxHeight: 200,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  contentText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
  },
  acceptButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  acceptAllButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 48,
  },
  acceptAllButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
