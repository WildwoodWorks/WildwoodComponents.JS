import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, FlatList, StyleSheet, Alert } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { MessageThread, SecureMessage } from '@wildwood/core';
import { useMessaging } from '../hooks/useMessaging';

export interface SecureMessagingComponentProps {
  onThreadSelected?: (thread: MessageThread) => void;
  style?: ViewStyle;
}

const REACTION_EMOJIS = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}'];

export function SecureMessagingComponent({ onThreadSelected, style }: SecureMessagingComponentProps) {
  const {
    threads,
    loading,
    error,
    getThreads,
    getMessages,
    sendMessage,
    createThread,
    editMessage,
    deleteMessage,
    reactToMessage,
    markThreadAsRead,
    searchUsers,
  } = useMessaging();

  const [localError, setLocalError] = useState<string | null>(null);

  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(null);
  const [messages, setMessages] = useState<SecureMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewThread, setShowNewThread] = useState(false);
  const [newThreadSubject, setNewThreadSubject] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; displayName: string }>>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<Array<{ id: string; displayName: string }>>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const messagesListRef = useRef<FlatList<SecureMessage>>(null);

  useEffect(() => {
    getThreads();
  }, [getThreads]);

  useEffect(() => {
    if (messages.length > 0) {
      messagesListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const handleSelectThread = useCallback(
    async (thread: MessageThread) => {
      try {
        setLocalError(null);
        setSelectedThread(thread);
        setShowNewThread(false);
        const msgs = await getMessages(thread.id);
        setMessages(msgs);
        await markThreadAsRead(thread.id);
        onThreadSelected?.(thread);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Failed to load thread');
      }
    },
    [getMessages, markThreadAsRead, onThreadSelected],
  );

  const handleSendMessage = useCallback(async () => {
    if (!messageInput.trim() || !selectedThread || sending) return;

    setSending(true);
    try {
      setLocalError(null);
      const msg = await sendMessage(selectedThread.id, messageInput.trim());
      setMessages((prev) => [...prev, msg]);
      setMessageInput('');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }, [messageInput, selectedThread, sending, sendMessage]);

  const handleSearchUsers = useCallback(
    async (query: string) => {
      setUserSearchQuery(query);
      if (query.length >= 2) {
        try {
          const results = await searchUsers(query);
          setSearchResults(results.map((u) => ({ id: u.userId, displayName: u.userName })));
        } catch (err) {
          setLocalError(err instanceof Error ? err.message : 'Failed to search users');
        }
      } else {
        setSearchResults([]);
      }
    },
    [searchUsers],
  );

  const handleCreateThread = useCallback(async () => {
    if (selectedParticipants.length === 0) return;
    try {
      setLocalError(null);
      const thread = await createThread(
        selectedParticipants.map((p) => p.id),
        newThreadSubject || '',
      );
      setShowNewThread(false);
      setNewThreadSubject('');
      setSelectedParticipants([]);
      setUserSearchQuery('');
      await handleSelectThread(thread);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to create thread');
    }
  }, [selectedParticipants, newThreadSubject, createThread, handleSelectThread]);

  const handleEditMessage = useCallback(
    async (messageId: string) => {
      if (!editContent.trim()) return;
      try {
        setLocalError(null);
        await editMessage(messageId, editContent.trim());
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content: editContent.trim() } : m)));
        setEditingMessageId(null);
        setEditContent('');
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Failed to edit message');
      }
    },
    [editContent, editMessage],
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      Alert.alert('Delete Message', 'Are you sure you want to delete this message?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLocalError(null);
              await deleteMessage(messageId);
              setMessages((prev) => prev.filter((m) => m.id !== messageId));
            } catch (err) {
              setLocalError(err instanceof Error ? err.message : 'Failed to delete message');
            }
          },
        },
      ]);
    },
    [deleteMessage],
  );

  const handleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      try {
        setLocalError(null);
        await reactToMessage(messageId, emoji);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Failed to add reaction');
      }
    },
    [reactToMessage],
  );

  const renderThreadItem = useCallback(
    ({ item: thread }: { item: MessageThread }) => {
      const isActive = selectedThread?.id === thread.id;
      return (
        <Pressable
          style={[styles.threadItem, isActive && styles.threadItemActive]}
          onPress={() => handleSelectThread(thread)}
        >
          <View style={styles.threadItemRow}>
            <Text
              style={[styles.threadSubject, thread.unreadCount ? styles.threadSubjectUnread : null]}
              numberOfLines={1}
            >
              {thread.subject || 'No Subject'}
            </Text>
            {thread.unreadCount ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{thread.unreadCount}</Text>
              </View>
            ) : null}
          </View>
          {thread.lastMessagePreview ? (
            <Text style={styles.threadPreview} numberOfLines={1}>
              {thread.lastMessagePreview.slice(0, 50)}
            </Text>
          ) : null}
        </Pressable>
      );
    },
    [selectedThread, handleSelectThread],
  );

  const renderMessageItem = useCallback(
    ({ item: msg }: { item: SecureMessage }) => (
      <View style={styles.messageItem}>
        <View style={styles.messageHeader}>
          <Text style={styles.messageSender}>{msg.senderName ?? 'Unknown'}</Text>
          <Text style={styles.messageTime}>{new Date(msg.createdAt).toLocaleString()}</Text>
        </View>
        {editingMessageId === msg.id ? (
          <View style={styles.editRow}>
            <TextInput style={[styles.input, styles.editInput]} value={editContent} onChangeText={setEditContent} />
            <Pressable style={styles.actionButtonPrimary} onPress={() => handleEditMessage(msg.id)}>
              <Text style={styles.actionButtonPrimaryText}>Save</Text>
            </Pressable>
            <Pressable style={styles.actionButtonOutline} onPress={() => setEditingMessageId(null)}>
              <Text style={styles.actionButtonOutlineText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.messageContent}>{msg.content}</Text>
        )}
        <View style={styles.messageActions}>
          {REACTION_EMOJIS.map((emoji) => (
            <Pressable key={emoji} style={styles.reactionButton} onPress={() => handleReaction(msg.id, emoji)}>
              <Text style={styles.reactionButtonText}>{emoji}</Text>
            </Pressable>
          ))}
          <Pressable
            style={styles.actionButtonSmall}
            onPress={() => {
              setEditingMessageId(msg.id);
              setEditContent(msg.content);
            }}
          >
            <Text style={styles.actionButtonSmallText}>Edit</Text>
          </Pressable>
          <Pressable style={styles.actionButtonSmall} onPress={() => handleDeleteMessage(msg.id)}>
            <Text style={styles.actionButtonSmallTextDanger}>Delete</Text>
          </Pressable>
        </View>
        {msg.reactions && msg.reactions.length > 0 && (
          <View style={styles.reactionsRow}>
            {msg.reactions.map((r) => (
              <View key={r.id} style={styles.reactionChip}>
                <Text style={styles.reactionChipText}>{r.emoji}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    ),
    [editingMessageId, editContent, handleEditMessage, handleDeleteMessage, handleReaction],
  );

  // New thread form
  const renderNewThreadForm = () => (
    <View style={styles.newThreadForm}>
      <Text style={styles.sectionTitle}>New Conversation</Text>
      <View style={styles.formGroup}>
        <Text style={styles.label}>Subject</Text>
        <TextInput
          style={styles.input}
          value={newThreadSubject}
          onChangeText={setNewThreadSubject}
          placeholder="Optional subject"
          placeholderTextColor="#999"
        />
      </View>
      <View style={styles.formGroup}>
        <Text style={styles.label}>Add Participants</Text>
        <TextInput
          style={styles.input}
          value={userSearchQuery}
          onChangeText={handleSearchUsers}
          placeholder="Search users..."
          placeholderTextColor="#999"
        />
        {searchResults.length > 0 && (
          <View style={styles.searchResultsContainer}>
            {searchResults.map((user) => (
              <Pressable
                key={user.id}
                style={styles.searchResultItem}
                onPress={() => {
                  if (!selectedParticipants.find((p) => p.id === user.id)) {
                    setSelectedParticipants((prev) => [...prev, user]);
                  }
                  setSearchResults([]);
                  setUserSearchQuery('');
                }}
              >
                <Text style={styles.searchResultText}>{user.displayName}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {selectedParticipants.length > 0 && (
          <View style={styles.participantsRow}>
            {selectedParticipants.map((p) => (
              <View key={p.id} style={styles.participantTag}>
                <Text style={styles.participantTagText}>{p.displayName}</Text>
                <Pressable
                  onPress={() => setSelectedParticipants((prev) => prev.filter((x) => x.id !== p.id))}
                  hitSlop={8}
                >
                  <Text style={styles.participantTagRemove}>{'\u00D7'}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>
      <View style={styles.formActions}>
        <Pressable
          style={[styles.primaryButton, selectedParticipants.length === 0 && styles.buttonDisabled]}
          onPress={handleCreateThread}
          disabled={selectedParticipants.length === 0}
        >
          <Text style={styles.primaryButtonText}>Create</Text>
        </Pressable>
        <Pressable style={styles.outlineButton} onPress={() => setShowNewThread(false)}>
          <Text style={styles.outlineButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );

  // Message view for selected thread
  const renderMessageView = () => (
    <View style={styles.messageArea}>
      <View style={styles.messageAreaHeader}>
        <Pressable style={styles.backButton} onPress={() => setSelectedThread(null)}>
          <Text style={styles.backButtonText}>{'\u2190'}</Text>
        </Pressable>
        <Text style={styles.sectionTitle} numberOfLines={1}>
          {selectedThread?.subject || 'Conversation'}
        </Text>
      </View>
      <FlatList
        ref={messagesListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessageItem}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, styles.messageInput]}
          value={messageInput}
          onChangeText={setMessageInput}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          editable={!sending}
          onSubmitEditing={handleSendMessage}
          returnKeyType="send"
        />
        <Pressable
          style={[styles.sendButton, (!messageInput.trim() || sending) && styles.buttonDisabled]}
          onPress={handleSendMessage}
          disabled={!messageInput.trim() || sending}
        >
          {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendButtonText}>Send</Text>}
        </Pressable>
      </View>
    </View>
  );

  // Empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>Select a conversation or start a new one</Text>
    </View>
  );

  return (
    <View style={[styles.container, style]}>
      {(error || localError) && (
        <View style={styles.alertError}>
          <Text style={styles.alertErrorText}>{error || localError}</Text>
        </View>
      )}

      {/* Thread list view (shown when no thread is selected and not creating new) */}
      {!selectedThread && !showNewThread && (
        <View style={styles.threadListContainer}>
          <View style={styles.threadListHeader}>
            <Text style={styles.sectionTitle}>Messages</Text>
            <Pressable style={styles.newButton} onPress={() => setShowNewThread(true)}>
              <Text style={styles.newButtonText}>New</Text>
            </Pressable>
          </View>
          {loading && threads.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : threads.length === 0 ? (
            renderEmptyState()
          ) : (
            <FlatList
              data={threads}
              keyExtractor={(item) => item.id}
              renderItem={renderThreadItem}
              style={styles.threadList}
              contentContainerStyle={styles.threadListContent}
            />
          )}
        </View>
      )}

      {/* New thread form */}
      {showNewThread && !selectedThread && renderNewThreadForm()}

      {/* Message view */}
      {selectedThread && renderMessageView()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  // Alerts
  alertError: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    margin: 16,
    marginBottom: 0,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  alertErrorText: {
    color: '#991B1B',
    fontSize: 14,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },

  // Thread list
  threadListContainer: {
    flex: 1,
  },
  threadListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  threadList: {
    flex: 1,
  },
  threadListContent: {
    paddingVertical: 4,
  },
  threadItem: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  threadItemActive: {
    backgroundColor: '#E8F0FE',
  },
  threadItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  threadSubject: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1a1a1a',
    flex: 1,
    marginRight: 8,
  },
  threadSubjectUnread: {
    fontWeight: '700',
  },
  threadPreview: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  unreadBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  // New button
  newButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  newButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Section title
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
  },

  // New thread form
  newThreadForm: {
    flex: 1,
    padding: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
  },
  searchResultsContainer: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  searchResultItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchResultText: {
    fontSize: 14,
    color: '#1a1a1a',
  },
  participantsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  participantTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  participantTagText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
    marginRight: 6,
  },
  participantTagRemove: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '300',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Message area
  messageArea: {
    flex: 1,
  },
  messageAreaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  backButtonText: {
    fontSize: 22,
    color: '#007AFF',
    fontWeight: '600',
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: 16,
    gap: 12,
  },

  // Message item
  messageItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  messageSender: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  messageTime: {
    fontSize: 12,
    color: '#999',
  },
  messageContent: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
  },

  // Edit row
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  editInput: {
    flex: 1,
  },
  actionButtonPrimary: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionButtonPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  actionButtonOutline: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionButtonOutlineText: {
    color: '#007AFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // Message actions
  messageActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reactionButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
  },
  reactionButtonText: {
    fontSize: 16,
  },
  actionButtonSmall: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  actionButtonSmallText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  actionButtonSmallTextDanger: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '500',
  },

  // Reactions
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  reactionChip: {
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reactionChipText: {
    fontSize: 14,
  },

  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 8,
  },
  messageInput: {
    flex: 1,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 15,
    color: '#999',
  },
});
