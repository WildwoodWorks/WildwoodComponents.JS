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
} from 'react-native';
import type { AIChatResponse, AISessionSummary } from '@wildwood/core';
import { useAI } from '../hooks/useAI';

export interface AIChatComponentProps {
  configurationName?: string;
  sessionId?: string;
  placeholder?: string;
  showSessionList?: boolean;
  onMessageReceived?: (response: AIChatResponse) => void;
  style?: object;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function AIChatComponent({
  configurationName,
  sessionId: initialSessionId,
  placeholder = 'Type your message...',
  showSessionList = true,
  onMessageReceived,
  style,
}: AIChatComponentProps) {
  const { sessions, loading, error, sendMessage, getSessions, createSession, deleteSession } = useAI();

  const [currentSessionId, setCurrentSessionId] = useState(initialSessionId ?? '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (showSessionList) {
      getSessions();
    }
  }, [showSessionList, getSessions]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);
    setSending(true);

    try {
      const response = await sendMessage({
        message: userMessage,
        sessionId: currentSessionId || undefined,
        configurationId: configurationName ?? '',
      });

      if (response.sessionId && !currentSessionId) {
        setCurrentSessionId(response.sessionId);
      }

      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: response.response ?? '',
        timestamp: new Date(),
      }]);

      onMessageReceived?.(response);
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Sorry, an error occurred. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, currentSessionId, configurationName, sendMessage, onMessageReceived]);

  const handleNewSession = useCallback(async () => {
    if (!configurationName) return;
    const session = await createSession(configurationName);
    if (session) {
      setCurrentSessionId(session.id);
    }
    setMessages([]);
    setShowSidebar(false);
  }, [configurationName, createSession]);

  const handleSelectSession = useCallback((session: AISessionSummary) => {
    setCurrentSessionId(session.id);
    setMessages([]);
    setShowSidebar(false);
  }, []);

  const handleDeleteSession = useCallback(async (id: string) => {
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
  }, [deleteSession, currentSessionId]);

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => (
    <View style={[styles.messageBubbleRow, item.role === 'user' ? styles.userRow : styles.assistantRow]}>
      <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.bubbleText, item.role === 'user' ? styles.userText : styles.assistantText]}>
          {item.content}
        </Text>
      </View>
    </View>
  ), []);

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

      {/* Header with session toggle */}
      {showSessionList && (
        <View style={styles.header}>
          <Pressable style={styles.sessionsButton} onPress={() => setShowSidebar(!showSidebar)}>
            <Text style={styles.sessionsButtonText}>
              {showSidebar ? 'Hide Sessions' : 'Sessions'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.newButton, (!configurationName || loading) && styles.disabledButton]}
            onPress={handleNewSession}
            disabled={loading || !configurationName}
          >
            <Text style={styles.newButtonText}>New Chat</Text>
          </Pressable>
        </View>
      )}

      {/* Session sidebar (shown as a panel) */}
      {showSidebar && (
        <View style={styles.sidebar}>
          <ScrollView style={styles.sessionList}>
            {sessions.map((s) => (
              <View
                key={s.id}
                style={[styles.sessionItem, currentSessionId === s.id && styles.sessionItemActive]}
              >
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
                <Pressable
                  style={styles.deleteButton}
                  onPress={() => handleDeleteSession(s.id)}
                  hitSlop={8}
                >
                  <Text style={styles.deleteText}>{'\u00D7'}</Text>
                </Pressable>
              </View>
            ))}
            {sessions.length === 0 && (
              <Text style={styles.emptyText}>No sessions yet</Text>
            )}
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
            <Text style={styles.emptyStateText}>Start a conversation...</Text>
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
          placeholder={placeholder}
          editable={!sending}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          multiline
        />
        <Pressable
          style={[styles.sendButton, (!input.trim() || sending) && styles.disabledButton]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
        >
          <Text style={styles.sendButtonText}>{sending ? '...' : 'Send'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
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
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    color: '#9CA3AF',
    fontSize: 16,
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
});
