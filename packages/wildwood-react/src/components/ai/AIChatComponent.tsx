import { useState, useEffect, useCallback, useRef } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import type { AIChatResponse, AISessionSummary, AIConfiguration, TTSVoice } from '@wildwood/core';
import { useAI } from '../../hooks/useAI.js';

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
  settings?: AIChatSettings;
  onMessageReceived?: (response: AIChatResponse) => void;
  onSessionCreated?: (sessionId: string) => void;
  onAuthenticationFailed?: () => void;
  className?: string;
}

let _msgIdCounter = 0;

interface ChatMessage {
  id: string;
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
  settings: userSettings,
  onMessageReceived,
  onSessionCreated,
  onAuthenticationFailed,
  className,
}: AIChatComponentProps) {
  const settings = { ...defaultSettings, ...userSettings };
  const {
    sessions,
    loading,
    error: aiError,
    sendMessage,
    sendMessageWithFile,
    getSessions,
    createSession,
    deleteSession,
    renameSession,
    getConfigurations,
    getTTSVoices,
    synthesizeSpeech,
  } = useAI();

  // Core state
  const [currentSessionId, setCurrentSessionId] = useState(initialSessionId ?? '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Configuration state
  const [configurations, setConfigurations] = useState<AIConfiguration[]>([]);
  const [currentConfigId, setCurrentConfigId] = useState('');

  // Session details popup
  const [showSessionDetails, setShowSessionDetails] = useState(false);
  const [selectedSession, setSelectedSession] = useState<AISessionSummary | null>(null);

  // Typing indicator
  const [isTyping, setIsTyping] = useState(false);

  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsVoices, setTtsVoices] = useState<TTSVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [selectedSpeed, setSelectedSpeed] = useState(1.0);
  const [showTTSSettings, setShowTTSSettings] = useState(false);
  const [showSpeechMenu, setShowSpeechMenu] = useState(false);

  // Speech-to-text state
  const [sttEnabled, setSttEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // File upload state
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load sessions and configurations
  useEffect(() => {
    if (settings.enableSessions) {
      getSessions().catch((err) => {
        if (err?.message?.includes('401') || err?.message?.includes('Unauthorized')) {
          onAuthenticationFailed?.();
        }
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
        if (err?.message?.includes('401') || err?.message?.includes('Unauthorized')) {
          onAuthenticationFailed?.();
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load TTS voices
  useEffect(() => {
    if (settings.enableTextToSpeech) {
      getTTSVoices()
        .then((voices) => {
          setTtsVoices(voices);
          if (voices.length > 0) {
            const defaultVoice = voices[0];
            setSelectedVoice(defaultVoice?.id ?? voices[0].id);
          }
        })
        .catch((err) => {
          if (err?.message?.includes('401') || err?.message?.includes('Unauthorized')) {
            onAuthenticationFailed?.();
          }
        });
    }
  }, [settings.enableTextToSpeech]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Auto-resize textarea
  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, []);

  // Send message
  const handleSend = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (!input.trim() || sending) return;

      const userMessage = input.trim();
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      setMessages((prev) => [
        ...prev,
        { id: `msg-${++_msgIdCounter}`, role: 'user', content: userMessage, timestamp: new Date() },
      ]);
      setSending(true);
      setIsTyping(true);
      setErrorMessage('');

      try {
        const chatRequest = {
          message: userMessage,
          sessionId: currentSessionId || undefined,
          configurationId: currentConfigId || configurationName || '',
        };
        const response = pendingFile
          ? await sendMessageWithFile(chatRequest, pendingFile)
          : await sendMessage(chatRequest);
        setPendingFile(null);

        if (response.sessionId && !currentSessionId) {
          setCurrentSessionId(response.sessionId);
          onSessionCreated?.(response.sessionId);
        }

        const assistantContent = response.response ?? '';
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${++_msgIdCounter}`,
            role: 'assistant',
            content: assistantContent,
            timestamp: new Date(),
          },
        ]);

        onMessageReceived?.(response);

        // TTS: speak the response
        if (ttsEnabled && settings.enableTextToSpeech && assistantContent) {
          speakText(assistantContent);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'An error occurred';
        if (msg.includes('401') || msg.includes('Unauthorized')) {
          onAuthenticationFailed?.();
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${++_msgIdCounter}`,
            role: 'assistant',
            content: msg,
            timestamp: new Date(),
            isError: true,
          },
        ]);
      } finally {
        setSending(false);
        setIsTyping(false);
      }
    },
    [
      input,
      sending,
      currentSessionId,
      currentConfigId,
      configurationName,
      sendMessage,
      onMessageReceived,
      onSessionCreated,
      ttsEnabled,
      settings.enableTextToSpeech,
      onAuthenticationFailed,
    ],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  // Enter key to send (Shift+Enter for newline)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Session management
  const handleNewSession = useCallback(async () => {
    const configId = currentConfigId || configurationName;
    if (!configId) return;
    const session = await createSession(configId);
    if (session) {
      setCurrentSessionId(session.id);
      onSessionCreated?.(session.id);
    }
    setMessages([]);
    setIsSidebarOpen(false);
  }, [currentConfigId, configurationName, createSession, onSessionCreated]);

  const handleSelectSession = useCallback((session: AISessionSummary) => {
    setCurrentSessionId(session.id);
    setMessages([]);
    setIsSidebarOpen(false);
  }, []);

  const handleDeleteSession = useCallback(
    async (id: string) => {
      await deleteSession(id);
      if (currentSessionId === id) {
        setCurrentSessionId('');
        setMessages([]);
      }
    },
    [deleteSession, currentSessionId],
  );

  const handleRenameSession = useCallback(async () => {
    if (!currentSessionId) return;
    const name = prompt('Enter a new name for this session:');
    if (name) {
      await renameSession(currentSessionId, name);
    }
  }, [currentSessionId, renameSession]);

  const handleShowSessionDetails = useCallback((session: AISessionSummary) => {
    setSelectedSession(session);
    setShowSessionDetails(true);
  }, []);

  // Configuration change
  const handleConfigChange = useCallback((configId: string) => {
    setCurrentConfigId(configId);
    setMessages([]);
    setCurrentSessionId('');
  }, []);

  // TTS
  const speakText = useCallback(
    async (text: string) => {
      if (!selectedVoice) return;
      setIsSpeaking(true);
      try {
        const result = await synthesizeSpeech(text, selectedVoice, selectedSpeed, currentConfigId || undefined);
        if (result?.audioBase64) {
          const audio = new Audio(`data:${result.contentType};base64,${result.audioBase64}`);
          audioRef.current = audio;
          audio.onended = () => setIsSpeaking(false);
          audio.onerror = () => setIsSpeaking(false);
          await audio.play();
        } else {
          setIsSpeaking(false);
        }
      } catch {
        setIsSpeaking(false);
      }
    },
    [selectedVoice, selectedSpeed, currentConfigId, synthesizeSpeech],
  );

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  // Format message content (basic markdown-like rendering)
  const formatContent = (content: string): string => {
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>');
  };

  const canSendMessage = !sending && input.trim().length > 0;

  return (
    <div
      className={`ww-aichat ${isSidebarOpen ? 'ww-aichat-sidebar-open' : 'ww-aichat-sidebar-closed'} ${className ?? ''}`}
    >
      {/* Sidebar */}
      <div className={`ww-aichat-sidebar ${isSidebarOpen ? 'ww-aichat-sidebar-visible' : ''}`}>
        <div className="ww-aichat-sidebar-header">
          <button type="button" className="ww-aichat-new-chat-btn" onClick={handleNewSession} title="New Chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            <span>New Chat</span>
          </button>
          <button
            type="button"
            className="ww-aichat-sidebar-close"
            onClick={() => setIsSidebarOpen(false)}
            title="Close sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </button>
        </div>

        {settings.enableSessions && (
          <div className="ww-aichat-sessions">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`ww-aichat-session-item ${currentSessionId === s.id ? 'ww-active' : ''}`}
                onClick={() => handleSelectSession(s)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="ww-aichat-session-icon">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
                </svg>
                <span className="ww-aichat-session-name">{s.sessionName || 'Untitled'}</span>
                {currentSessionId === s.id && (
                  <div className="ww-aichat-session-actions">
                    <button
                      type="button"
                      className="ww-aichat-session-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRenameSession();
                      }}
                      title="Rename"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="ww-aichat-session-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShowSessionDetails(s);
                      }}
                      title="Details"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="ww-aichat-session-action-btn ww-aichat-session-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(s.id);
                      }}
                      title="Delete"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
            {sessions.length === 0 && (
              <div className="ww-aichat-no-sessions">
                <p>No previous chats</p>
              </div>
            )}
          </div>
        )}

        {/* Configuration selector */}
        {configurations.length > 1 && settings.showConfigurationSelector && (
          <div className="ww-aichat-sidebar-footer">
            <select
              className="ww-aichat-config-select"
              value={currentConfigId}
              onChange={(e) => handleConfigChange(e.target.value)}
              aria-label="AI Configuration"
            >
              {configurations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Sidebar overlay (mobile) */}
      {isSidebarOpen && <div className="ww-aichat-sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />}

      {/* Main chat area */}
      <div className="ww-aichat-main">
        {/* Floating sidebar toggle */}
        {!isSidebarOpen && (
          <button
            type="button"
            className="ww-aichat-sidebar-toggle"
            onClick={() => setIsSidebarOpen(true)}
            title="Open sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0" />
            </svg>
          </button>
        )}

        {/* Messages */}
        <div className="ww-aichat-messages">
          {settings.showDebugInfo && (
            <div className="ww-aichat-debug">
              DEBUG: Messages = {messages.length} | Session = {currentSessionId || 'none'} | Config ={' '}
              {currentConfigId || 'none'}
            </div>
          )}

          {messages.length === 0 && !isTyping && (
            <div className="ww-aichat-empty">
              <p>{settings.welcomeMessage}</p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`ww-aichat-message ww-aichat-message-${msg.role}`}>
              <div className={`ww-aichat-bubble ${msg.isError ? 'ww-aichat-error-msg' : ''}`}>
                {msg.isError ? (
                  <div className="ww-aichat-error-content">{msg.content}</div>
                ) : msg.role === 'assistant' ? (
                  <div dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }} />
                ) : (
                  msg.content
                )}
              </div>
              {msg.role === 'assistant' && settings.enableTextToSpeech && ttsEnabled && !msg.isError && (
                <button
                  type="button"
                  className="ww-aichat-speak-btn"
                  onClick={() => (isSpeaking ? stopSpeaking() : speakText(msg.content))}
                  title={isSpeaking ? 'Stop speaking' : 'Read aloud'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    {isSpeaking ? (
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    ) : (
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                    )}
                  </svg>
                </button>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="ww-aichat-message ww-aichat-message-assistant">
              <div className="ww-aichat-bubble">
                <div className="ww-aichat-typing-dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="ww-aichat-input-area">
          {(aiError || errorMessage) && (
            <div className="ww-aichat-error-banner">
              {aiError || errorMessage}
              <button type="button" className="ww-aichat-error-close" onClick={() => setErrorMessage('')}>
                &times;
              </button>
            </div>
          )}

          {isListening && (
            <div className="ww-aichat-speech-status">
              <span className="ww-aichat-listening-indicator" />
              Listening...
            </div>
          )}

          {/* TTS Settings Panel */}
          {settings.enableTextToSpeech && showTTSSettings && (
            <div className="ww-aichat-tts-settings">
              <div className="ww-aichat-tts-header">
                <span>Voice Settings</span>
                <button type="button" onClick={() => setShowTTSSettings(false)}>
                  &times;
                </button>
              </div>
              <div className="ww-aichat-tts-content">
                <div className="ww-aichat-tts-row">
                  <label htmlFor="ww-voice-select">Voice</label>
                  {ttsVoices.length > 0 ? (
                    <select
                      id="ww-voice-select"
                      className="ww-aichat-tts-select"
                      value={selectedVoice}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                    >
                      {ttsVoices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="ww-text-muted">No voices available</span>
                  )}
                </div>
                <div className="ww-aichat-tts-row">
                  <label htmlFor="ww-speed-range">Speed: {selectedSpeed.toFixed(1)}x</label>
                  <div className="ww-aichat-tts-speed">
                    <span>0.5x</span>
                    <input
                      id="ww-speed-range"
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={selectedSpeed}
                      onChange={(e) => setSelectedSpeed(parseFloat(e.target.value))}
                      className="ww-aichat-tts-slider"
                    />
                    <span>2x</span>
                  </div>
                </div>
                <div className="ww-aichat-tts-row">
                  <button
                    type="button"
                    className="ww-btn ww-btn-sm ww-btn-outline"
                    onClick={() => speakText('This is a test of the selected voice.')}
                    disabled={isSpeaking || ttsVoices.length === 0}
                  >
                    {isSpeaking ? 'Speaking...' : 'Test Voice'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Input container */}
          <div className="ww-aichat-input-container">
            {settings.enableFileUpload && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="ww-aichat-file-input"
                  aria-label="Choose file to attach"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setPendingFile(file);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className={`ww-aichat-action-btn ${pendingFile ? 'ww-active' : ''}`}
                  title={pendingFile ? `Attached: ${pendingFile.name}` : 'Attach file'}
                  disabled={sending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
                  </svg>
                </button>
                {pendingFile && (
                  <span className="ww-aichat-file-badge">
                    {pendingFile.name}
                    <button
                      type="button"
                      className="ww-aichat-file-remove"
                      onClick={() => setPendingFile(null)}
                      title="Remove file"
                    >
                      &times;
                    </button>
                  </span>
                )}
              </>
            )}

            {/* Speech controls */}
            {(settings.enableSpeechToText || settings.enableTextToSpeech) && (
              <>
                <button
                  type="button"
                  className={`ww-aichat-speech-toggle ${showSpeechMenu ? 'ww-active' : ''} ${isListening ? 'ww-listening' : ''}`}
                  onClick={() => setShowSpeechMenu(!showSpeechMenu)}
                  title="Voice options"
                  disabled={sending}
                >
                  {isListening ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                    </svg>
                  ) : isSpeaking ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                    </svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" />
                    </svg>
                  )}
                </button>

                {showSpeechMenu && (
                  <div className="ww-aichat-speech-menu">
                    <div className="ww-aichat-speech-menu-header">
                      <span>Voice Options</span>
                      <button type="button" onClick={() => setShowSpeechMenu(false)}>
                        &times;
                      </button>
                    </div>
                    {settings.enableSpeechToText && (
                      <button
                        type="button"
                        className={`ww-aichat-speech-menu-item ${sttEnabled ? 'ww-active' : ''}`}
                        onClick={() => {
                          setSttEnabled(!sttEnabled);
                          setShowSpeechMenu(false);
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                        </svg>
                        <span>Voice Input</span>
                        <span className="ww-aichat-speech-status-text">{sttEnabled ? 'On' : 'Off'}</span>
                      </button>
                    )}
                    {settings.enableTextToSpeech && (
                      <>
                        <button
                          type="button"
                          className={`ww-aichat-speech-menu-item ${ttsEnabled ? 'ww-active' : ''}`}
                          onClick={() => {
                            setTtsEnabled(!ttsEnabled);
                            setShowSpeechMenu(false);
                          }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                          </svg>
                          <span>AI Voice</span>
                          <span className="ww-aichat-speech-status-text">{ttsEnabled ? 'On' : 'Off'}</span>
                        </button>
                        {ttsEnabled && (
                          <button
                            type="button"
                            className="ww-aichat-speech-menu-item"
                            onClick={() => {
                              setShowTTSSettings(true);
                              setShowSpeechMenu(false);
                            }}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c.04.31.06.63.06.94s-.02.63-.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                            </svg>
                            <span>Voice Settings</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            <textarea
              ref={textareaRef}
              className="ww-aichat-input"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={settings.placeholderText}
              rows={1}
              disabled={sending}
              maxLength={settings.maxMessageLength}
            />

            <div className="ww-aichat-input-actions">
              {isSpeaking && (
                <button
                  type="button"
                  className="ww-aichat-action-btn ww-aichat-stop-tts"
                  onClick={stopSpeaking}
                  title="Stop speaking"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              )}

              <button
                type="button"
                className={`ww-aichat-send-btn ${canSendMessage ? 'ww-enabled' : ''}`}
                onClick={() => handleSend()}
                disabled={!canSendMessage}
                title="Send"
              >
                {sending ? (
                  <span className="ww-spinner ww-spinner-sm" />
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Session Details Popup */}
      {showSessionDetails && selectedSession && (
        <div className="ww-aichat-session-details-overlay" onClick={() => setShowSessionDetails(false)}>
          <div className="ww-aichat-session-details-popup" onClick={(e) => e.stopPropagation()}>
            <div className="ww-aichat-session-details-header">
              <h4>Session Details</h4>
              <button type="button" onClick={() => setShowSessionDetails(false)}>
                &times;
              </button>
            </div>
            <div className="ww-aichat-session-details-content">
              <div className="ww-aichat-session-details-name">{selectedSession.sessionName || 'Untitled'}</div>
              <div className="ww-aichat-session-details-info">
                <div className="ww-aichat-session-details-row">
                  <span>Created:</span>
                  <span>{new Date(selectedSession.createdAt).toLocaleString()}</span>
                </div>
                {selectedSession.messageCount !== undefined && (
                  <div className="ww-aichat-session-details-row">
                    <span>Messages:</span>
                    <span>{selectedSession.messageCount}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="ww-aichat-session-details-actions">
              <button
                type="button"
                className="ww-btn ww-btn-primary ww-btn-sm"
                onClick={() => {
                  handleSelectSession(selectedSession);
                  setShowSessionDetails(false);
                }}
              >
                Open Session
              </button>
              <button
                type="button"
                className="ww-btn ww-btn-outline ww-btn-sm"
                onClick={() => setShowSessionDetails(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
