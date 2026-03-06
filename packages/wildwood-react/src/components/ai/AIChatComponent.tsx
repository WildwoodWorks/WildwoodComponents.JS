import { useState, useEffect, useCallback, useRef } from 'react';
import type { FormEvent } from 'react';
import type { AIChatResponse, AISessionSummary } from '@wildwood/core';
import { useAI } from '../../hooks/useAI.js';

export interface AIChatComponentProps {
  configurationName?: string;
  sessionId?: string;
  placeholder?: string;
  showSessionList?: boolean;
  onMessageReceived?: (response: AIChatResponse) => void;
  className?: string;
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
  className,
}: AIChatComponentProps) {
  const { sessions, loading, error, sendMessage, getSessions, createSession, deleteSession } = useAI();

  const [currentSessionId, setCurrentSessionId] = useState(initialSessionId ?? '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showSessionList) {
      getSessions();
    }
  }, [showSessionList, getSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async (e: FormEvent) => {
    e.preventDefault();
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
  }, [configurationName, createSession]);

  const handleSelectSession = useCallback((session: AISessionSummary) => {
    setCurrentSessionId(session.id);
    setMessages([]);
  }, []);

  const handleDeleteSession = useCallback(async (id: string) => {
    await deleteSession(id);
    if (currentSessionId === id) {
      setCurrentSessionId('');
      setMessages([]);
    }
  }, [deleteSession, currentSessionId]);

  return (
    <div className={`ww-aichat-component ${className ?? ''}`}>
      {error && <div className="ww-alert ww-alert-danger">{error}</div>}

      <div className="ww-aichat-layout">
        {/* Session sidebar */}
        {showSessionList && (
          <div className="ww-aichat-sidebar">
            <div className="ww-aichat-sidebar-header">
              <h4>Sessions</h4>
              <button
                type="button"
                className="ww-btn ww-btn-sm ww-btn-primary"
                onClick={handleNewSession}
                disabled={loading || !configurationName}
              >
                New
              </button>
            </div>
            <div className="ww-session-list">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`ww-session-item ${currentSessionId === s.id ? 'ww-active' : ''}`}
                  onClick={() => handleSelectSession(s)}
                >
                  <span className="ww-session-title">{s.sessionName || 'Untitled'}</span>
                  <button
                    type="button"
                    className="ww-btn-icon ww-btn-sm"
                    onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                    aria-label="Delete session"
                  >
                    &times;
                  </button>
                </div>
              ))}
              {sessions.length === 0 && (
                <p className="ww-text-muted ww-text-center">No sessions</p>
              )}
            </div>
          </div>
        )}

        {/* Chat area */}
        <div className="ww-aichat-main">
          <div className="ww-aichat-messages">
            {messages.length === 0 && (
              <div className="ww-aichat-empty">
                <p className="ww-text-muted">Start a conversation...</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`ww-chat-message ww-chat-${msg.role}`}>
                <div className="ww-chat-bubble">
                  {msg.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="ww-chat-message ww-chat-assistant">
                <div className="ww-chat-bubble ww-chat-typing">Thinking...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="ww-aichat-input" onSubmit={handleSend}>
            <input
              type="text"
              className="ww-form-control"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={placeholder}
              disabled={sending}
            />
            <button
              type="submit"
              className="ww-btn ww-btn-primary"
              disabled={!input.trim() || sending}
            >
              {sending ? '...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
