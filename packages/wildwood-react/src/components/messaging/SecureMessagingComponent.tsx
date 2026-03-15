import { useState, useEffect, useCallback, useRef } from 'react';
import type { FormEvent } from 'react';
import type { MessageThread, SecureMessage, MessageAttachment, CompanyAppUser } from '@wildwood/core';
import { useMessaging } from '../../hooks/useMessaging.js';
import { useSession } from '../../hooks/useSession.js';

export interface SecureMessagingComponentProps {
  showSearch?: boolean;
  showParticipants?: boolean;
  showTypingIndicators?: boolean;
  showOnlineStatus?: boolean;
  enableFileUploads?: boolean;
  enableReactions?: boolean;
  allowedFileTypes?: string[];
  maxMessageLength?: number;
  onThreadSelected?: (thread: MessageThread) => void;
  onMessageSent?: (message: SecureMessage) => void;
  onAuthenticationFailed?: () => void;
  className?: string;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👏'];

function getInitials(name?: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  if (hours < 48) return 'yesterday';
  return date.toLocaleDateString();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function isImageType(contentType: string): boolean {
  return contentType.startsWith('image/');
}

export function SecureMessagingComponent({
  showSearch = true,
  showParticipants = true,
  showTypingIndicators = true,
  showOnlineStatus = true,
  enableFileUploads = true,
  enableReactions = true,
  allowedFileTypes,
  maxMessageLength = 5000,
  onThreadSelected,
  onMessageSent,
  onAuthenticationFailed,
  className,
}: SecureMessagingComponentProps) {
  const { userId } = useSession();

  const {
    threads,
    loading,
    error,
    connectionState,
    connect,
    disconnect,
    getThreads,
    getMessages,
    sendMessage,
    createThread,
    editMessage,
    deleteMessage,
    reactToMessage,
    removeReaction,
    markThreadAsRead,
    searchUsers,
    searchMessages,
    uploadAttachment,
    downloadAttachment,
    startTyping,
    stopTyping,
    getTypingIndicators,
    onMessage,
    onTyping,
  } = useMessaging();

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
  const [threadSearch, setThreadSearch] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showParticipantList, setShowParticipantList] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);
  const [replyToMessage, setReplyToMessage] = useState<SecureMessage | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchCounterRef = useRef(0);

  // Clean up typing timer on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    getThreads();
  }, [getThreads]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen for real-time messages
  useEffect(() => {
    if (!onMessage) return;
    const unsub = onMessage((msg: SecureMessage) => {
      if (msg.threadId === selectedThread?.id) {
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
      getThreads();
    });
    return unsub;
  }, [selectedThread?.id, onMessage, getThreads]);

  // Listen for typing indicators
  useEffect(() => {
    if (!onTyping || !showTypingIndicators) return;
    const unsub = onTyping((indicator) => {
      if (indicator.threadId !== selectedThread?.id) return;
      setTypingUsers((prev) => {
        if (indicator.isVisible) {
          return prev.includes(indicator.userName) ? prev : [...prev, indicator.userName];
        }
        return prev.filter((u) => u !== indicator.userName);
      });
    });
    return unsub;
  }, [selectedThread?.id, onTyping, showTypingIndicators]);

  const handleSelectThread = useCallback(
    async (thread: MessageThread) => {
      setSelectedThread(thread);
      setShowNewThread(false);
      setMobileSidebarOpen(false);
      setTypingUsers([]);
      setReplyToMessage(null);
      setShowEmojiPicker(null);
      const msgs = await getMessages(thread.id);
      setMessages(msgs);
      await markThreadAsRead(thread.id);
      onThreadSelected?.(thread);
    },
    [getMessages, markThreadAsRead, onThreadSelected],
  );

  const handleSendMessage = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!selectedThread || sending) return;
      if (!messageInput.trim() && pendingFiles.length === 0) return;
      if (messageInput.length > maxMessageLength) return;

      setSending(true);
      try {
        // Upload attachments first
        if (pendingFiles.length > 0) {
          setUploading(true);
          for (const file of pendingFiles) {
            await uploadAttachment(selectedThread.id, file);
          }
          setUploading(false);
          setPendingFiles([]);
        }

        // Send message
        if (messageInput.trim()) {
          const msg = await sendMessage(selectedThread.id, messageInput.trim(), replyToMessage?.id);
          setMessages((prev) => [...prev, msg]);
          onMessageSent?.(msg);
        }

        setMessageInput('');
        setReplyToMessage(null);
        if (stopTyping) stopTyping(selectedThread.id);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Failed to send message');
      } finally {
        setSending(false);
        setUploading(false);
      }
    },
    [
      messageInput,
      selectedThread,
      sending,
      sendMessage,
      stopTyping,
      maxMessageLength,
      replyToMessage,
      pendingFiles,
      uploadAttachment,
      onMessageSent,
    ],
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setMessageInput(value);
      if (selectedThread && startTyping) {
        startTyping(selectedThread.id);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          if (selectedThread && stopTyping) stopTyping(selectedThread.id);
        }, 3000);
      }
    },
    [selectedThread, startTyping, stopTyping],
  );

  const handleSearchUsers = useCallback(
    async (query: string) => {
      setUserSearchQuery(query);
      if (query.length >= 2) {
        const thisSearch = ++searchCounterRef.current;
        const results = await searchUsers(query);
        // Only update if this is still the latest search
        if (thisSearch === searchCounterRef.current) {
          setSearchResults(results.map((u: CompanyAppUser) => ({ id: u.userId, displayName: u.userName })));
        }
      } else {
        searchCounterRef.current++;
        setSearchResults([]);
      }
    },
    [searchUsers],
  );

  const handleCreateThread = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (selectedParticipants.length === 0) return;
      try {
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
        setLocalError(err instanceof Error ? err.message : 'Failed to create conversation');
      }
    },
    [selectedParticipants, newThreadSubject, createThread, handleSelectThread],
  );

  const handleEditMessage = useCallback(
    async (messageId: string) => {
      if (!editContent.trim()) return;
      try {
        await editMessage(messageId, editContent.trim());
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, content: editContent.trim(), isEdited: true } : m)),
        );
        setEditingMessageId(null);
        setEditContent('');
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Failed to edit message');
      }
    },
    [editContent, editMessage],
  );

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      try {
        await deleteMessage(messageId);
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, isDeleted: true, content: 'This message was deleted' } : m)),
        );
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Failed to delete message');
      }
    },
    [deleteMessage],
  );

  const handleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      try {
        await reactToMessage(messageId, emoji);
        setShowEmojiPicker(null);
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Failed to add reaction');
      }
    },
    [reactToMessage],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (allowedFileTypes && allowedFileTypes.length > 0) {
        const filtered = files.filter((f) => allowedFileTypes.some((t) => f.type.startsWith(t) || f.name.endsWith(t)));
        setPendingFiles((prev) => [...prev, ...filtered]);
      } else {
        setPendingFiles((prev) => [...prev, ...files]);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [allowedFileTypes],
  );

  const handleRemovePendingFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const scrollToMessage = useCallback((messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ww-message-highlight');
      setTimeout(() => el.classList.remove('ww-message-highlight'), 2000);
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage(e as unknown as FormEvent);
      }
    },
    [handleSendMessage],
  );

  const filteredThreads = threadSearch
    ? threads.filter(
        (t) =>
          t.subject?.toLowerCase().includes(threadSearch.toLowerCase()) ||
          t.lastMessagePreview?.toLowerCase().includes(threadSearch.toLowerCase()) ||
          t.participants?.some((p) => p.userName?.toLowerCase().includes(threadSearch.toLowerCase())),
      )
    : threads;

  const renderAvatar = (name?: string, avatarUrl?: string, size: 'sm' | 'xs' = 'sm') => {
    if (avatarUrl) {
      return <img className={`ww-avatar ww-avatar-${size}`} src={avatarUrl} alt={name ?? 'User'} />;
    }
    return <div className={`ww-avatar ww-avatar-${size}`}>{getInitials(name)}</div>;
  };

  const renderAttachment = (attachment: MessageAttachment) => {
    if (isImageType(attachment.contentType) && attachment.thumbnailUrl) {
      return (
        <div key={attachment.id} className="ww-message-attachment ww-message-attachment-image">
          <img src={attachment.thumbnailUrl} alt={attachment.fileName} />
          <span className="ww-attachment-name">{attachment.fileName}</span>
        </div>
      );
    }
    return (
      <div key={attachment.id} className="ww-message-attachment ww-message-attachment-file">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <div className="ww-attachment-info">
          <span className="ww-attachment-name">{attachment.fileName}</span>
          <span className="ww-attachment-size">{formatFileSize(attachment.fileSize)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className={`ww-messaging-component ${className ?? ''}`}>
      {(error || localError) && (
        <div className="ww-alert ww-alert-danger ww-messaging-error">
          {error || localError}
          <button type="button" className="ww-alert-dismiss" onClick={() => setLocalError(null)}>
            &times;
          </button>
        </div>
      )}

      <div className="ww-messaging-layout">
        {/* Thread sidebar */}
        <div className={`ww-messaging-sidebar ${mobileSidebarOpen ? 'ww-messaging-sidebar-open' : ''}`}>
          <div className="ww-messaging-sidebar-header">
            <h4>Messages</h4>
            <div className="ww-messaging-sidebar-actions">
              {showOnlineStatus && connectionState && (
                <span
                  className={`ww-messaging-status ww-messaging-status-${connectionState === 'connected' ? 'online' : 'offline'}`}
                  title={connectionState}
                >
                  {connectionState === 'connected' ? '\u2022' : '\u25CB'}
                </span>
              )}
              <button
                type="button"
                className="ww-btn ww-btn-sm ww-btn-primary"
                onClick={() => {
                  setShowNewThread(true);
                  setMobileSidebarOpen(false);
                }}
                title="New conversation"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </div>

          {showSearch && (
            <div className="ww-messaging-search">
              <input
                type="text"
                className="ww-form-control ww-form-control-sm"
                value={threadSearch}
                onChange={(e) => setThreadSearch(e.target.value)}
                placeholder="Search conversations..."
              />
            </div>
          )}

          <div className="ww-thread-list">
            {loading && threads.length === 0 && (
              <div className="ww-messaging-loading">
                <div className="ww-spinner ww-spinner-sm" />
              </div>
            )}
            {filteredThreads.map((thread) => {
              const otherParticipant = thread.participants?.find((p) => p.userId !== userId);
              return (
                <div
                  key={thread.id}
                  className={`ww-thread-item ${selectedThread?.id === thread.id ? 'ww-active' : ''} ${thread.unreadCount ? 'ww-unread' : ''}`}
                  onClick={() => handleSelectThread(thread)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleSelectThread(thread)}
                >
                  <div className="ww-thread-avatar">
                    {renderAvatar(otherParticipant?.userName ?? thread.subject, otherParticipant?.avatar)}
                  </div>
                  <div className="ww-thread-info">
                    <div className="ww-thread-top">
                      <span className="ww-thread-subject">
                        {thread.subject || otherParticipant?.userName || 'No Subject'}
                      </span>
                      {thread.lastActivity && (
                        <span className="ww-thread-time">{formatTimestamp(thread.lastActivity)}</span>
                      )}
                    </div>
                    <div className="ww-thread-bottom">
                      <span className="ww-thread-preview">{thread.lastMessagePreview?.slice(0, 60)}</span>
                      {thread.unreadCount ? (
                        <span className="ww-badge ww-badge-primary ww-badge-pill">{thread.unreadCount}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {!loading && filteredThreads.length === 0 && (
              <div className="ww-messaging-empty-threads">
                <p className="ww-text-muted">{threadSearch ? 'No matching conversations' : 'No conversations yet'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Main message area */}
        <div className="ww-messaging-main">
          {/* Mobile toggle */}
          <button
            type="button"
            className="ww-messaging-mobile-toggle"
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            aria-label="Toggle conversation list"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {showNewThread ? (
            <div className="ww-new-thread-panel">
              <div className="ww-new-thread-header">
                <h4>New Conversation</h4>
                <button
                  type="button"
                  className="ww-btn-icon"
                  onClick={() => setShowNewThread(false)}
                  aria-label="Close new conversation"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <form onSubmit={handleCreateThread} className="ww-new-thread-form">
                <div className="ww-form-group">
                  <label>Subject</label>
                  <input
                    type="text"
                    className="ww-form-control"
                    value={newThreadSubject}
                    onChange={(e) => setNewThreadSubject(e.target.value)}
                    placeholder="Optional subject"
                  />
                </div>
                <div className="ww-form-group">
                  <label>Add Participants</label>
                  <input
                    type="text"
                    className="ww-form-control"
                    value={userSearchQuery}
                    onChange={(e) => handleSearchUsers(e.target.value)}
                    placeholder="Search users..."
                  />
                  {searchResults.length > 0 && (
                    <div className="ww-search-results">
                      {searchResults.map((user) => (
                        <div
                          key={user.id}
                          className="ww-search-result-item"
                          onClick={() => {
                            if (!selectedParticipants.find((p) => p.id === user.id)) {
                              setSelectedParticipants((prev) => [...prev, user]);
                            }
                            setSearchResults([]);
                            setUserSearchQuery('');
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) =>
                            e.key === 'Enter' &&
                            (() => {
                              if (!selectedParticipants.find((p) => p.id === user.id)) {
                                setSelectedParticipants((prev) => [...prev, user]);
                              }
                              setSearchResults([]);
                              setUserSearchQuery('');
                            })()
                          }
                        >
                          <div className="ww-avatar ww-avatar-xs">{getInitials(user.displayName)}</div>
                          <span>{user.displayName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedParticipants.length > 0 && (
                    <div className="ww-selected-participants">
                      {selectedParticipants.map((p) => (
                        <span key={p.id} className="ww-participant-tag">
                          {p.displayName}
                          <button
                            type="button"
                            onClick={() => setSelectedParticipants((prev) => prev.filter((x) => x.id !== p.id))}
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="ww-form-actions">
                  <button type="submit" className="ww-btn ww-btn-primary" disabled={selectedParticipants.length === 0}>
                    Create Conversation
                  </button>
                  <button type="button" className="ww-btn ww-btn-outline" onClick={() => setShowNewThread(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : selectedThread ? (
            <>
              {/* Conversation header */}
              <div className="ww-messaging-header">
                <div className="ww-messaging-header-info">
                  <h4>{selectedThread.subject || 'Conversation'}</h4>
                  {selectedThread.participants?.length > 0 && (
                    <span className="ww-text-muted ww-text-sm">{selectedThread.participants.length} participants</span>
                  )}
                </div>
                <div className="ww-messaging-header-actions">
                  {showParticipants && (
                    <button
                      type="button"
                      className="ww-btn-icon"
                      onClick={() => setShowParticipantList(!showParticipantList)}
                      title="View participants"
                      aria-label="View participants"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Participant panel */}
              {showParticipantList && selectedThread.participants && (
                <div className="ww-participant-panel">
                  <div className="ww-participant-panel-header">
                    <h5>Participants ({selectedThread.participants.length})</h5>
                    <button
                      type="button"
                      className="ww-btn-icon"
                      onClick={() => setShowParticipantList(false)}
                      aria-label="Close participants"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  <div className="ww-participant-list">
                    {selectedThread.participants
                      .filter((p) => p.isActive)
                      .map((participant) => (
                        <div key={participant.id} className="ww-participant-item">
                          {renderAvatar(participant.userName, participant.avatar, 'sm')}
                          <div className="ww-participant-info">
                            <span className="ww-participant-name">
                              {participant.userName}
                              {participant.userId === userId && <span className="ww-text-muted"> (you)</span>}
                            </span>
                            <span className="ww-text-muted ww-text-sm">{participant.role}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              <div className="ww-message-list">
                {messages.map((msg) => {
                  const isOwn = msg.senderId === userId;
                  const replyTo = msg.replyToMessageId ? messages.find((m) => m.id === msg.replyToMessageId) : null;

                  return (
                    <div
                      key={msg.id}
                      id={`msg-${msg.id}`}
                      className={`ww-message-item ${isOwn ? 'ww-message-own' : ''} ${msg.isDeleted ? 'ww-message-deleted' : ''}`}
                    >
                      {!isOwn && (
                        <div className="ww-message-avatar">{renderAvatar(msg.senderName, msg.senderAvatar)}</div>
                      )}
                      <div className="ww-message-bubble">
                        {!isOwn && <div className="ww-message-sender">{msg.senderName ?? 'Unknown'}</div>}

                        {/* Reply context */}
                        {replyTo && (
                          <div
                            className="ww-message-reply-context"
                            onClick={() => scrollToMessage(replyTo.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === 'Enter' && scrollToMessage(replyTo.id)}
                          >
                            <div className="ww-reply-bar" />
                            <div className="ww-reply-content">
                              <span className="ww-reply-sender">{replyTo.senderName}</span>
                              <span className="ww-reply-text">{replyTo.content.slice(0, 100)}</span>
                            </div>
                          </div>
                        )}

                        {editingMessageId === msg.id ? (
                          <div className="ww-message-edit">
                            <textarea
                              className="ww-form-control"
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={2}
                              aria-label="Edit message"
                            />
                            <div className="ww-message-edit-actions">
                              <button
                                type="button"
                                className="ww-btn ww-btn-sm ww-btn-primary"
                                onClick={() => handleEditMessage(msg.id)}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="ww-btn ww-btn-sm ww-btn-outline"
                                onClick={() => setEditingMessageId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="ww-message-content">{msg.content}</div>
                            {msg.isEdited && !msg.isDeleted && <span className="ww-message-edited">(edited)</span>}
                          </>
                        )}

                        {/* Attachments */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="ww-message-attachments">
                            {msg.attachments.map((att) => renderAttachment(att))}
                          </div>
                        )}

                        <div className="ww-message-meta">
                          <span className="ww-message-time">{formatTimestamp(msg.createdAt)}</span>
                          {msg.readReceipts && msg.readReceipts.length > 0 && (
                            <span className="ww-message-read" title="Read">
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Message actions */}
                      {editingMessageId !== msg.id && !msg.isDeleted && (
                        <div className="ww-message-actions">
                          {/* Reply button */}
                          <button
                            type="button"
                            className="ww-btn-icon ww-btn-xs"
                            onClick={() => setReplyToMessage(msg)}
                            title="Reply"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <polyline points="9 17 4 12 9 7" />
                              <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                            </svg>
                          </button>

                          {/* Emoji reactions */}
                          {enableReactions && (
                            <div className="ww-emoji-reaction-wrapper">
                              <button
                                type="button"
                                className="ww-btn-icon ww-btn-xs"
                                onClick={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)}
                                title="React"
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <circle cx="12" cy="12" r="10" />
                                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                                  <line x1="9" y1="9" x2="9.01" y2="9" />
                                  <line x1="15" y1="9" x2="15.01" y2="9" />
                                </svg>
                              </button>
                              {showEmojiPicker === msg.id && (
                                <div className="ww-emoji-picker">
                                  {QUICK_EMOJIS.map((emoji) => (
                                    <button
                                      key={emoji}
                                      type="button"
                                      className="ww-emoji-btn"
                                      onClick={() => handleReaction(msg.id, emoji)}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {isOwn && (
                            <>
                              <button
                                type="button"
                                className="ww-btn-icon ww-btn-xs"
                                onClick={() => {
                                  setEditingMessageId(msg.id);
                                  setEditContent(msg.content);
                                }}
                                title="Edit"
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="ww-btn-icon ww-btn-xs ww-btn-danger"
                                onClick={() => handleDeleteMessage(msg.id)}
                                title="Delete"
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Reactions display */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className="ww-message-reactions">
                          {msg.reactions.map((r) => (
                            <span key={r.id} className="ww-reaction">
                              {r.emoji}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Typing indicators */}
              {showTypingIndicators && typingUsers.length > 0 && (
                <div className="ww-messaging-typing">
                  <span className="ww-typing-dots">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span>
                    {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                  </span>
                </div>
              )}

              {/* Reply context bar */}
              {replyToMessage && (
                <div className="ww-messaging-reply-bar">
                  <div className="ww-reply-bar" />
                  <div className="ww-reply-info">
                    <span className="ww-reply-label">
                      Replying to <strong>{replyToMessage.senderName}</strong>
                    </span>
                    <span className="ww-reply-preview">{replyToMessage.content.slice(0, 80)}</span>
                  </div>
                  <button
                    type="button"
                    className="ww-btn-icon"
                    onClick={() => setReplyToMessage(null)}
                    aria-label="Cancel reply"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Pending files preview */}
              {pendingFiles.length > 0 && (
                <div className="ww-messaging-pending-files">
                  {pendingFiles.map((file, i) => (
                    <div key={i} className="ww-pending-file">
                      <span className="ww-pending-file-name">{file.name}</span>
                      <span className="ww-pending-file-size">{formatFileSize(file.size)}</span>
                      <button
                        type="button"
                        className="ww-btn-icon ww-btn-xs"
                        onClick={() => handleRemovePendingFile(i)}
                        aria-label="Remove file"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input area */}
              <form className="ww-messaging-input" onSubmit={handleSendMessage}>
                {enableFileUploads && (
                  <>
                    <button
                      type="button"
                      className="ww-btn-icon ww-messaging-attach"
                      onClick={() => fileInputRef.current?.click()}
                      title="Attach file"
                      aria-label="Attach file"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="ww-sr-only"
                      onChange={handleFileSelect}
                      accept={allowedFileTypes?.join(',')}
                      aria-label="Upload file attachment"
                    />
                  </>
                )}
                <textarea
                  className="ww-messaging-textarea"
                  value={messageInput}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={replyToMessage ? 'Type a reply...' : 'Type a message...'}
                  disabled={sending}
                  rows={1}
                  maxLength={maxMessageLength}
                />
                {maxMessageLength && messageInput.length > maxMessageLength * 0.8 && (
                  <span className="ww-messaging-char-count">
                    {messageInput.length}/{maxMessageLength}
                  </span>
                )}
                <button
                  type="submit"
                  className="ww-btn ww-btn-primary ww-messaging-send"
                  disabled={(!messageInput.trim() && pendingFiles.length === 0) || sending}
                  title="Send message"
                >
                  {uploading ? (
                    <div className="ww-spinner ww-spinner-xs" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="ww-messaging-empty">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity="0.4"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p className="ww-text-muted">Select a conversation or start a new one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
