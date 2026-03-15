import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import type { AIChatResponse, AISessionSummary, AIConfiguration } from '@wildwood/core';
import { useAI } from '../hooks/useAI';

export interface AIChatSettings {
  enableSessions?: boolean;
  enableSpeechToText?: boolean;
  enableTextToSpeech?: boolean;
  enableFileUpload?: boolean;
  useServerTTS?: boolean;
  showDebugInfo?: boolean;
  showConfigurationSelector?: boolean;
  welcomeMessage?: string;
  placeholderText?: string;
  maxMessageLength?: number;
}

export interface AIChatComponentProps {
  configurationName?: string;
  sessionId?: string;
  /** @deprecated Use settings.placeholderText instead */
  placeholder?: string;
  /** @deprecated Use settings.enableSessions instead */
  showSessionList?: boolean;
  settings?: AIChatSettings;
  onMessageReceived?: (response: AIChatResponse) => void;
  onSessionCreated?: (sessionId: string) => void;
  onAuthenticationFailed?: () => void;
  style?: ViewStyle;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isError?: boolean;
}

const defaultSettings: Required<AIChatSettings> = {
  enableSessions: true,
  enableSpeechToText: false,
  enableTextToSpeech: false,
  enableFileUpload: false,
  useServerTTS: false,
  showDebugInfo: false,
  showConfigurationSelector: true,
  welcomeMessage: "What's on the agenda today?",
  placeholderText: 'Ask anything',
  maxMessageLength: 4000,
};

export function AIChatComponent({
  configurationName,
  sessionId: initialSessionId,
  placeholder,
  showSessionList,
  settings: userSettings,
  onMessageReceived,
  onSessionCreated,
  onAuthenticationFailed,
  style,
}: AIChatComponentProps) {
  // Merge settings with backward-compat for legacy props
  const settings: Required<AIChatSettings> = {
    ...defaultSettings,
    ...userSettings,
    // Legacy prop overrides if settings prop not provided
    ...(showSessionList !== undefined && userSettings?.enableSessions === undefined
      ? { enableSessions: showSessionList }
      : {}),
    ...(placeholder !== undefined && userSettings?.placeholderText === undefined
      ? { placeholderText: placeholder }
      : {}),
  };

  const {
    sessions,
    loading,
    error,
    sendMessage,
    getSessions,
    createSession,
    deleteSession,
    renameSession,
    getConfigurations,
  } = useAI();

  // Core state
  const [currentSessionId, setCurrentSessionId] = useState(initialSessionId ?? '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  // Sidebar state
  const [showSidebar, setShowSidebar] = useState(false);

  // Configuration state
  const [configurations, setConfigurations] = useState<AIConfiguration[]>([]);
  const [currentConfigId, setCurrentConfigId] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Rename state
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // Load sessions and configurations on mount
  useEffect(() => {
    if (settings.enableSessions) {
      getSessions().catch((err) => {
        if (isAuthError(err)) onAuthenticationFailed?.();
      });
    }
    getConfigurations()
      .then((configs) => {
        setConfigurations(configs);
        if (configurationName) {
          const match = configs.find((c) => c.name === configurationName || c.id === configurationName);
          if (match) setCurrentConfigId(match.id);
        } else if (configs.length > 0) {
          setCurrentConfigId(configs[0].id);
        }
      })
      .catch((err) => {
        if (isAuthError(err)) onAuthenticationFailed?.();
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;

    const userMessage = input.trim();
    if (settings.maxMessageLength && userMessage.length > settings.maxMessageLength) {
      Alert.alert('Message too long', `Maximum length is ${settings.maxMessageLength} characters.`);
      return;
    }

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);
    setSending(true);

    try {
      const response = await sendMessage({
        message: userMessage,
        sessionId: currentSessionId || undefined,
        configurationId: currentConfigId || configurationName || '',
      });

      if (response.sessionId && !currentSessionId) {
        setCurrentSessionId(response.sessionId);
        onSessionCreated?.(response.sessionId);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response.response ?? '',
          timestamp: new Date(),
        },
      ]);

      onMessageReceived?.(response);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      if (isAuthError(err)) {
        onAuthenticationFailed?.();
      }
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Sorry, an error occurred: ${errorMsg}`,
          timestamp: new Date(),
          isError: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [
    input,
    sending,
    currentSessionId,
    currentConfigId,
    configurationName,
    sendMessage,
    onMessageReceived,
    onSessionCreated,
    onAuthenticationFailed,
    settings.maxMessageLength,
  ]);

  const handleNewSession = useCallback(async () => {
    const configId = currentConfigId || configurationName;
    if (!configId) return;
    const session = await createSession(configId);
    if (session) {
      setCurrentSessionId(session.id);
      onSessionCreated?.(session.id);
    }
    setMessages([]);
    setShowSidebar(false);
  }, [currentConfigId, configurationName, createSession, onSessionCreated]);

  const handleSelectSession = useCallback((session: AISessionSummary) => {
    setCurrentSessionId(session.id);
    setMessages([]);
    setShowSidebar(false);
  }, []);

  const handleDeleteSession = useCallback(
    async (id: string) => {
      Alert.alert('Delete Session', 'Are you sure you want to delete this session?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteSession(id);
            if (currentSessionId === id) {
              setCurrentSessionId('');
              setMessages([]);
            }
          },
        },
      ]);
    },
    [deleteSession, currentSessionId],
  );

  // Rename session: start inline editing
  const handleStartRename = useCallback((session: AISessionSummary) => {
    setRenamingSessionId(session.id);
    setRenameText(session.sessionName || '');
  }, []);

  const handleSubmitRename = useCallback(async () => {
    if (!renamingSessionId || !renameText.trim()) {
      setRenamingSessionId(null);
      return;
    }
    await renameSession(renamingSessionId, renameText.trim());
    setRenamingSessionId(null);
    setRenameText('');
  }, [renamingSessionId, renameText, renameSession]);

  const handleCancelRename = useCallback(() => {
    setRenamingSessionId(null);
    setRenameText('');
  }, []);

  // Configuration change
  const handleConfigChange = useCallback((configId: string) => {
    setCurrentConfigId(configId);
    setMessages([]);
    setCurrentSessionId('');
    setShowConfigModal(false);
  }, []);

  // Get current config name for display
  const currentConfigName = configurations.find((c) => c.id === currentConfigId)?.name || '';

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <View style={[styles.messageBubbleRow, item.role === 'user' ? styles.userRow : styles.assistantRow]}>
        <View
          style={[
            styles.bubble,
            item.role === 'user' ? styles.userBubble : styles.assistantBubble,
            item.isError ? styles.errorBubble : undefined,
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              item.role === 'user' ? styles.userText : styles.assistantText,
              item.isError ? styles.errorBubbleText : undefined,
            ]}
          >
            {item.content}
          </Text>
        </View>
      </View>
    ),
    [],
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Debug info */}
      {settings.showDebugInfo && (
        <View style={styles.debugBanner}>
          <Text style={styles.debugText}>
            DEBUG: Messages = {messages.length} | Session = {currentSessionId || 'none'} | Config ={' '}
            {currentConfigId || 'none'}
          </Text>
        </View>
      )}

      {/* Header with session toggle and config selector */}
      {settings.enableSessions && (
        <View style={styles.header}>
          <Pressable style={styles.sessionsButton} onPress={() => setShowSidebar(!showSidebar)}>
            <Text style={styles.sessionsButtonText}>{showSidebar ? 'Hide Sessions' : 'Sessions'}</Text>
          </Pressable>
          <View style={styles.headerRight}>
            {/* Configuration selector button */}
            {settings.showConfigurationSelector && configurations.length > 1 && (
              <Pressable style={styles.configButton} onPress={() => setShowConfigModal(true)}>
                <Text style={styles.configButtonText} numberOfLines={1}>
                  {currentConfigName || 'Select Config'}
                </Text>
                <Text style={styles.configChevron}>{'\u25BC'}</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.newButton, ((!currentConfigId && !configurationName) || loading) && styles.disabledButton]}
              onPress={handleNewSession}
              disabled={loading || (!currentConfigId && !configurationName)}
            >
              <Text style={styles.newButtonText}>New Chat</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Session sidebar (shown as a panel) */}
      {showSidebar && (
        <View style={styles.sidebar}>
          <ScrollView style={styles.sessionList}>
            {sessions.map((s) => (
              <View key={s.id} style={[styles.sessionItem, currentSessionId === s.id && styles.sessionItemActive]}>
                {renamingSessionId === s.id ? (
                  // Inline rename
                  <View style={styles.renameRow}>
                    <TextInput
                      style={styles.renameInput}
                      value={renameText}
                      onChangeText={setRenameText}
                      autoFocus
                      onSubmitEditing={handleSubmitRename}
                      onBlur={handleCancelRename}
                      returnKeyType="done"
                      selectTextOnFocus
                    />
                  </View>
                ) : (
                  <>
                    <Pressable style={styles.sessionItemContent} onPress={() => handleSelectSession(s)}>
                      <Text
                        style={[styles.sessionTitle, currentSessionId === s.id && styles.sessionTitleActive]}
                        numberOfLines={1}
                      >
                        {s.sessionName || 'Untitled'}
                      </Text>
                      <Text style={styles.sessionPreview} numberOfLines={1}>
                        {s.lastMessagePreview || `${s.messageCount} messages`}
                      </Text>
                    </Pressable>
                    <View style={styles.sessionActions}>
                      {/* Rename button */}
                      <Pressable style={styles.sessionActionButton} onPress={() => handleStartRename(s)} hitSlop={6}>
                        <Text style={styles.sessionActionIcon}>{'\u270E'}</Text>
                      </Pressable>
                      {/* Delete button */}
                      <Pressable style={styles.deleteButton} onPress={() => handleDeleteSession(s.id)} hitSlop={8}>
                        <Text style={styles.deleteText}>{'\u00D7'}</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            ))}
            {sessions.length === 0 && <Text style={styles.emptyText}>No sessions yet</Text>}
          </ScrollView>
        </View>
      )}

      {/* Chat messages */}
      <FlatList
        ref={flatListRef}
        style={styles.messageList}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(_, i) => String(i)}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{settings.welcomeMessage || 'Start a conversation...'}</Text>
          </View>
        }
        ListFooterComponent={
          sending ? (
            <View style={[styles.messageBubbleRow, styles.assistantRow]}>
              <View style={[styles.bubble, styles.assistantBubble]}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={[styles.assistantText, { marginLeft: 8 }]}>Thinking...</Text>
              </View>
            </View>
          ) : null
        }
      />

      {/* Input area */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder={settings.placeholderText}
          editable={!sending}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          multiline
          maxLength={settings.maxMessageLength}
        />
        <Pressable
          style={[styles.sendButton, (!input.trim() || sending) && styles.disabledButton]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
        >
          <Text style={styles.sendButtonText}>{sending ? '...' : 'Send'}</Text>
        </Pressable>
      </View>

      {/* Configuration Selector Modal */}
      <Modal
        visible={showConfigModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfigModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowConfigModal(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Configuration</Text>
            <ScrollView style={styles.modalList}>
              {configurations.map((c) => (
                <Pressable
                  key={c.id}
                  style={[styles.modalItem, currentConfigId === c.id && styles.modalItemActive]}
                  onPress={() => handleConfigChange(c.id)}
                >
                  <Text style={[styles.modalItemText, currentConfigId === c.id && styles.modalItemTextActive]}>
                    {c.name}
                  </Text>
                  {c.description ? (
                    <Text style={styles.modalItemDescription} numberOfLines={2}>
                      {c.description}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalCloseButton} onPress={() => setShowConfigModal(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/** Check if an error is a 401/authentication error */
function isAuthError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes('401') || err.message.includes('Unauthorized');
  }
  return false;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA',
  },
  errorText: {
    color: '#991B1B',
    fontSize: 14,
  },
  debugBanner: {
    backgroundColor: '#FEF3C7',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  debugText: {
    color: '#92400E',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sessionsButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
  },
  sessionsButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  configButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    maxWidth: 140,
  },
  configButtonText: {
    fontSize: 13,
    color: '#374151',
    marginRight: 4,
    flexShrink: 1,
  },
  configChevron: {
    fontSize: 8,
    color: '#6B7280',
  },
  newButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#007AFF',
  },
  newButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  sidebar: {
    maxHeight: 200,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  sessionList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  sessionItemActive: {
    backgroundColor: '#DBEAFE',
  },
  sessionItemContent: {
    flex: 1,
    marginRight: 8,
  },
  sessionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  sessionTitleActive: {
    color: '#1D4ED8',
  },
  sessionPreview: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  sessionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sessionActionButton: {
    padding: 4,
  },
  sessionActionIcon: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  renameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  renameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    backgroundColor: '#fff',
    color: '#1F2937',
  },
  deleteButton: {
    padding: 4,
  },
  deleteText: {
    fontSize: 20,
    color: '#9CA3AF',
    fontWeight: '300',
  },
  emptyText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 14,
    paddingVertical: 16,
  },
  messageList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messageBubbleRow: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  userBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#F3F4F6',
    borderBottomLeftRadius: 4,
  },
  errorBubble: {
    backgroundColor: '#FEE2E2',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userText: {
    color: '#fff',
  },
  assistantText: {
    color: '#1F2937',
  },
  errorBubbleText: {
    color: '#991B1B',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    color: '#9CA3AF',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    backgroundColor: '#F9FAFB',
  },
  sendButton: {
    marginLeft: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#007AFF',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  // Configuration Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    maxHeight: '60%',
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1F2937',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalList: {
    maxHeight: 300,
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  modalItemActive: {
    backgroundColor: '#EFF6FF',
  },
  modalItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1F2937',
  },
  modalItemTextActive: {
    color: '#1D4ED8',
  },
  modalItemDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  modalCloseButton: {
    padding: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#007AFF',
  },
});
