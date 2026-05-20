import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, StyleSheet, Alert, Modal } from 'react-native';
import type { ViewStyle } from 'react-native';
import { sanitizeHtml, type PendingDisclaimerModel } from '@wildwood/core';
import { useDisclaimer } from '../hooks/useDisclaimer';

export interface DisclaimerComponentProps {
  /** Called after all disclaimers have been accepted */
  onAllAccepted?: () => void;
  /** Called when a single disclaimer is accepted */
  onDisclaimerAccepted?: (disclaimerId: string) => void;
  /** Whether to auto-load pending disclaimers on mount */
  autoLoad?: boolean;
  style?: ViewStyle;
}

// Sanitize first (strips dangerous tags/attrs/URL schemes), then flatten to text
// for RN's <Text> renderer. Sanitizing first is defense-in-depth: nothing renders
// HTML today, but it ensures script content can't leak through if a future renderer is swapped in.
const renderHtmlAsText = (html: string): string => {
  return sanitizeHtml(html)
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
  style,
}: DisclaimerComponentProps) {
  const { disclaimers, loading, getPendingDisclaimers, acceptDisclaimer, acceptAllDisclaimers } = useDisclaimer();

  const [accepting, setAccepting] = useState(false);
  const [expandedDisclaimer, setExpandedDisclaimer] = useState<PendingDisclaimerModel | null>(null);

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
    <ScrollView style={[styles.container, style]} contentContainerStyle={styles.contentContainer}>
      {pendingList.map((d) => (
        <View key={d.disclaimerId} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{d.title}</Text>
            <View style={styles.versionBadge}>
              <Text style={styles.versionBadgeText}>v{d.versionNumber}</Text>
            </View>
          </View>

          {d.previouslyAcceptedVersion != null && (
            <View style={styles.updateNotice}>
              <Text style={styles.updateNoticeText}>
                Updated from v{d.previouslyAcceptedVersion}
                {d.changeNotes ? `: ${d.changeNotes}` : ''}
              </Text>
            </View>
          )}

          <ScrollView style={styles.contentArea} nestedScrollEnabled>
            <Text style={styles.contentText}>
              {d.contentFormat === 'html' ? renderHtmlAsText(d.content) : d.content}
            </Text>
          </ScrollView>

          <Pressable style={styles.readFullButton} onPress={() => setExpandedDisclaimer(d)}>
            <Text style={styles.readFullButtonText}>Read Full Document</Text>
          </Pressable>

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
      <Modal
        visible={expandedDisclaimer !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setExpandedDisclaimer(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setExpandedDisclaimer(null)}>
          <View style={styles.modalContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{expandedDisclaimer?.title}</Text>
              <Pressable onPress={() => setExpandedDisclaimer(null)} hitSlop={8}>
                <Text style={styles.modalCloseIcon}>{'\u00D7'}</Text>
              </Pressable>
            </View>
            <View style={styles.modalMeta}>
              {expandedDisclaimer?.versionNumber != null && (
                <View style={styles.versionBadge}>
                  <Text style={styles.versionBadgeText}>v{expandedDisclaimer.versionNumber}</Text>
                </View>
              )}
              {expandedDisclaimer?.disclaimerType ? (
                <Text style={styles.metaText}>{expandedDisclaimer.disclaimerType}</Text>
              ) : null}
              {expandedDisclaimer?.previouslyAcceptedVersion != null && (
                <Text style={styles.metaText}>
                  Previously accepted: v{expandedDisclaimer.previouslyAcceptedVersion}
                </Text>
              )}
            </View>
            {expandedDisclaimer?.changeNotes ? (
              <View style={styles.modalChangeNotes}>
                <Text style={styles.changeNotesText}>
                  <Text style={styles.changeNotesLabel}>What changed: </Text>
                  {expandedDisclaimer.changeNotes}
                </Text>
              </View>
            ) : null}
            <ScrollView style={styles.modalScrollContent}>
              <Text style={styles.modalContentText}>
                {expandedDisclaimer?.contentFormat === 'html'
                  ? renderHtmlAsText(expandedDisclaimer.content)
                  : expandedDisclaimer?.content}
              </Text>
            </ScrollView>
            <View style={styles.modalFooter}>
              <Pressable style={styles.modalCloseButton} onPress={() => setExpandedDisclaimer(null)}>
                <Text style={styles.modalCloseButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
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
  updateNotice: {
    backgroundColor: '#EFF6FF',
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    marginBottom: 12,
  },
  updateNoticeText: {
    fontSize: 13,
    color: '#1E40AF',
  },
  readFullButton: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  readFullButtonText: {
    color: '#007AFF',
    fontSize: 13,
    fontWeight: '500',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
    marginRight: 8,
  },
  modalCloseIcon: {
    fontSize: 24,
    color: '#6B7280',
    lineHeight: 24,
  },
  modalMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  metaText: {
    fontSize: 13,
    color: '#6B7280',
  },
  modalChangeNotes: {
    backgroundColor: '#EFF6FF',
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
  },
  changeNotesText: {
    fontSize: 13,
    color: '#1E40AF',
  },
  changeNotesLabel: {
    fontWeight: '600',
  },
  modalScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalContentText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'flex-end',
  },
  modalCloseButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  modalCloseButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
