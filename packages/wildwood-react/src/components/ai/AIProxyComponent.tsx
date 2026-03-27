'use client';

import { useState, useCallback } from 'react';
import type { FormEvent } from 'react';
import type { AIChatResponse } from '@wildwood/core';
import { useAI } from '../../hooks/useAI.js';

export interface AIProxyComponentProps {
  configurationId: string;
  placeholder?: string;
  onResponse?: (response: AIChatResponse) => void;
  onError?: (error: string) => void;
  className?: string;
}

/**
 * Simple AI proxy component - sends a single message and displays the response.
 * No session management, no chat history. For quick AI interactions.
 */
export function AIProxyComponent({
  configurationId,
  placeholder = 'Ask a question...',
  onResponse,
  onError,
  className,
}: AIProxyComponentProps) {
  const { sendMessage, loading } = useAI();

  const [input, setInput] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState(0);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!input.trim() || loading) return;

      setError(null);
      setResponse(null);

      try {
        const result = await sendMessage({
          configurationId,
          message: input.trim(),
          saveToSession: false,
        });

        if (result.isError) {
          setError(result.errorMessage ?? 'AI request failed');
          onError?.(result.errorMessage ?? 'AI request failed');
        } else {
          setResponse(result.response);
          setTokensUsed(result.tokensUsed);
          onResponse?.(result);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI request failed';
        setError(msg);
        onError?.(msg);
      }
    },
    [input, loading, sendMessage, configurationId, onResponse, onError],
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
