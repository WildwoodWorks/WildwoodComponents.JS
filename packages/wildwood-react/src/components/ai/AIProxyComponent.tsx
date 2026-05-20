'use client';

import { useState, useCallback, useRef } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { AIChatResponse } from '@wildwood/core';
import { useAI } from '../../hooks/useAI.js';

export interface AIProxyComponentProps {
  configurationId: string;
  placeholder?: string;
  /** Allow attaching a file to the prompt. Default: false. */
  allowFileUpload?: boolean;
  /** Maximum file size in bytes. Default: 10MB. */
  maxFileSize?: number;
  /** Comma-separated list of accepted file extensions. */
  accept?: string;
  onResponse?: (response: AIChatResponse) => void;
  onError?: (error: string) => void;
  className?: string;
}

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;
const DEFAULT_ACCEPT = '.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.webp';

/**
 * Simple AI proxy component - sends a single message and displays the response.
 * No session management, no chat history. For quick AI interactions.
 */
export function AIProxyComponent({
  configurationId,
  placeholder = 'Ask a question...',
  allowFileUpload = false,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  accept = DEFAULT_ACCEPT,
  onResponse,
  onError,
  className,
}: AIProxyComponentProps) {
  const { sendProxyMessage, sendProxyMessageWithFile, loading } = useAI();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [input, setInput] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      if (!file) return;
      if (file.size > maxFileSize) {
        setError(`File exceeds maximum size of ${Math.round(maxFileSize / (1024 * 1024))}MB.`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      setSelectedFile(file);
      setError(null);
    },
    [maxFileSize],
  );

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!input.trim() || loading) return;

      setError(null);
      setResponse(null);

      try {
        const request = {
          configurationId,
          message: input.trim(),
          saveToSession: false,
        };
        const result = selectedFile
          ? await sendProxyMessageWithFile(request, selectedFile, selectedFile.name)
          : await sendProxyMessage(request);

        if (result.isError) {
          setError(result.errorMessage ?? 'AI request failed');
          onError?.(result.errorMessage ?? 'AI request failed');
        } else {
          setResponse(result.response);
          setTokensUsed(result.tokensUsed);
          clearFile();
          onResponse?.(result);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI request failed';
        setError(msg);
        onError?.(msg);
      }
    },
    [
      input,
      loading,
      selectedFile,
      sendProxyMessage,
      sendProxyMessageWithFile,
      configurationId,
      clearFile,
      onResponse,
      onError,
    ],
  );

  return (
    <div className={`ww-ai-proxy ${className ?? ''}`}>
      <form onSubmit={handleSubmit} className="ww-ai-proxy-form">
        <div className="ww-input-group">
          <input
            type="text"
            className="ww-form-control"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            disabled={loading}
          />
          {allowFileUpload && (
            <>
              {selectedFile ? (
                <div className="ww-ai-proxy-file-badge" title={selectedFile.name}>
                  <span className="ww-ai-proxy-file-name">{selectedFile.name}</span>
                  <button
                    type="button"
                    className="ww-ai-proxy-file-remove"
                    onClick={clearFile}
                    disabled={loading}
                    aria-label="Remove attached file"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <label className="ww-btn ww-btn-secondary ww-ai-proxy-attach">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept={accept}
                    onChange={handleFileChange}
                    disabled={loading}
                    hidden
                  />
                  Attach
                </label>
              )}
            </>
          )}
          <button type="submit" className="ww-btn ww-btn-primary" disabled={loading || !input.trim()}>
            {loading ? 'Thinking...' : 'Send'}
          </button>
        </div>
      </form>

      {error && <div className="ww-alert ww-alert-danger">{error}</div>}

      {response && (
        <div className="ww-ai-proxy-response">
          <div className="ww-ai-proxy-content">{response}</div>
          {tokensUsed > 0 && <small className="ww-text-muted">Tokens used: {tokensUsed}</small>}
        </div>
      )}
    </div>
  );
}
