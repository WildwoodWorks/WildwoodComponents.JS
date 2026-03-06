'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { FormEvent } from 'react';
import type { MessageThread, SecureMessage } from '@wildwood/core';
import { useMessaging } from '../../hooks/useMessaging.js';

export interface SecureMessagingComponentProps {
  className?: string;
  onThreadSelected?: (thread: MessageThread) => void;
}

export function SecureMessagingComponent({ className, onThreadSelected }: SecureMessagingComponentProps) {
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getThreads();
  }, [getThreads]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectThread = useCallback(
    async (thread: MessageThread) => {
      setSelectedThread(thread);
      setShowNewThread(false);
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
      if (!messageInput.trim() || !selectedThread || sending) return;

      setSending(true);
      try {
        const msg = await sendMessage(selectedThread.id, messageInput.trim());
        setMessages((prev) => [...prev, msg]);
        setMessageInput('');
      } finally {
        setSending(false);
      }
    },
    [messageInput, selectedThread, sending, sendMessage],
  );

  const handleSearchUsers = useCallback(
    async (query: string) => {
      setUserSearchQuery(query);
      if (query.length >= 2) {
        const results = await searchUsers(query);
        setSearchResults(results.map((u) => ({ id: u.userId, displayName: u.userName })));
      } else {
        setSearchResults([]);
      }
    },
    [searchUsers],
  );

  const handleCreateThread = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (selectedParticipants.length === 0) return;
      const thread = await createThread(
        selectedParticipants.map((p) => p.id),
        newThreadSubject || '',
      );
      setShowNewThread(false);
      setNewThreadSubject('');
      setSelectedParticipants([]);
      setUserSearchQuery('');
      await handleSelectThread(thread);
    },
    [selectedParticipants, newThreadSubject, createThread, handleSelectThread],
  );

  const handleEditMessage = useCallback(
    async (messageId: string) => {
      if (!editContent.trim()) return;
      await editMessage(messageId, editContent.trim());
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content: editContent.trim() } : m)));
      setEditingMessageId(null);
      setEditContent('');
    },
    [editContent, editMessage],
  );

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      await deleteMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    },
    [deleteMessage],
  );

  const handleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      await reactToMessage(messageId, emoji);
    },
    [reactToMessage],
  );

  return (
    <div className={`ww-messaging-component ${className ?? ''}`}>
      {error && <div className="ww-alert ww-alert-danger">{error}</div>}

      <div className="ww-messaging-layout">
        {/* Thread list */}
        <div className="ww-messaging-sidebar">
          <div className="ww-messaging-sidebar-header">
            <h4>Messages</h4>
            <button type="button" className="ww-btn ww-btn-sm ww-btn-primary" onClick={() => setShowNewThread(true)}>
              New
            </button>
          </div>
          <div className="ww-thread-list">
            {loading && threads.length === 0 && <p className="ww-text-muted">Loading...</p>}
            {threads.map((thread) => (
              <div
                key={thread.id}
                className={`ww-thread-item ${selectedThread?.id === thread.id ? 'ww-active' : ''} ${thread.unreadCount ? 'ww-unread' : ''}`}
                onClick={() => handleSelectThread(thread)}
              >
                <div className="ww-thread-subject">{thread.subject || 'No Subject'}</div>
                <div className="ww-thread-preview">
                  {thread.lastMessagePreview?.slice(0, 50)}
                  {thread.unreadCount ? <span className="ww-badge ww-badge-primary">{thread.unreadCount}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Message area */}
        <div className="ww-messaging-main">
          {showNewThread ? (
            <form onSubmit={handleCreateThread} className="ww-new-thread-form">
              <h4>New Conversation</h4>
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
                      >
                        {user.displayName}
                      </div>
                    ))}
                  </div>
                )}
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
              </div>
              <div className="ww-form-actions">
                <button type="submit" className="ww-btn ww-btn-primary" disabled={selectedParticipants.length === 0}>
                  Create
                </button>
                <button type="button" className="ww-btn ww-btn-outline" onClick={() => setShowNewThread(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : selectedThread ? (
            <>
              <div className="ww-messaging-header">
                <h4>{selectedThread.subject || 'Conversation'}</h4>
              </div>
              <div className="ww-message-list">
                {messages.map((msg) => (
                  <div key={msg.id} className="ww-message-item">
                    <div className="ww-message-header">
                      <strong>{msg.senderName ?? 'Unknown'}</strong>
                      <span className="ww-text-muted">{new Date(msg.createdAt).toLocaleString()}</span>
                    </div>
                    {editingMessageId === msg.id ? (
                      <div className="ww-message-edit">
                        <input
                          type="text"
                          className="ww-form-control"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                        />
                        <button className="ww-btn ww-btn-sm ww-btn-primary" onClick={() => handleEditMessage(msg.id)}>
                          Save
                        </button>
                        <button className="ww-btn ww-btn-sm ww-btn-outline" onClick={() => setEditingMessageId(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="ww-message-content">{msg.content}</div>
                    )}
                    <div className="ww-message-actions">
                      {['👍', '❤️', '😂'].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="ww-btn-icon ww-btn-sm"
                          onClick={() => handleReaction(msg.id, emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="ww-btn-icon ww-btn-sm"
                        onClick={() => {
                          setEditingMessageId(msg.id);
                          setEditContent(msg.content);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ww-btn-icon ww-btn-sm"
                        onClick={() => handleDeleteMessage(msg.id)}
                      >
                        Delete
                      </button>
                    </div>
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
                ))}
                <div ref={messagesEndRef} />
              </div>
              <form className="ww-messaging-input" onSubmit={handleSendMessage}>
                <input
                  type="text"
                  className="ww-form-control"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Type a message..."
                  disabled={sending}
                />
                <button type="submit" className="ww-btn ww-btn-primary" disabled={!messageInput.trim() || sending}>
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="ww-messaging-empty">
              <p className="ww-text-muted">Select a conversation or start a new one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
