'use client';

import { useState, useCallback } from 'react';
import type {
  AIChatRequest,
  AIChatResponse,
  AISession,
  AISessionSummary,
  AIConfiguration,
  TTSVoice,
  RequestOptions,
} from '@wildwood/core';
import { useWildwood } from './useWildwood.js';
import {
  streamOrchestratedChat,
  type OrchestratedChatRequest,
  type OrchestratedChatHandlers,
} from '../ai/orchestratedChat.js';

export interface UseAIReturn {
  sessions: AISessionSummary[];
  loading: boolean;
  error: string | null;
  sendMessage: (request: AIChatRequest, options?: RequestOptions) => Promise<AIChatResponse>;
  sendMessageWithFile: (
    request: AIChatRequest,
    file: File | Blob,
    fileName?: string,
    options?: RequestOptions,
  ) => Promise<AIChatResponse>;
  sendProxyMessage: (request: AIChatRequest, options?: RequestOptions) => Promise<AIChatResponse>;
  sendProxyMessageWithFile: (
    request: AIChatRequest,
    file: File | Blob,
    fileName?: string,
    options?: RequestOptions,
  ) => Promise<AIChatResponse>;
  /**
   * Drive a backend-orchestrated, tool-using chat turn over SSE against a caller-owned endpoint
   * (WS6C). Streams tool.started/tool.result/context.changed and a terminal done/confirm.required/error
   * to `handlers`. Authenticates with the current Wildwood session token. Resolves when the stream ends;
   * transport/HTTP errors are reported via `handlers.onError` (never thrown).
   */
  streamChat: (
    endpoint: string,
    request: OrchestratedChatRequest,
    handlers: OrchestratedChatHandlers,
    options?: { signal?: AbortSignal },
  ) => Promise<void>;
  getSessions: () => Promise<AISessionSummary[]>;
  getSession: (sessionId: string) => Promise<AISession | null>;
  createSession: (configName: string, title?: string) => Promise<AISession | null>;
  deleteSession: (sessionId: string) => Promise<void>;
  endSession: (sessionId: string) => Promise<boolean>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  getConfigurations: (configurationType?: string) => Promise<AIConfiguration[]>;
  getConfiguration: (name: string) => Promise<AIConfiguration | null>;
  getTTSVoices: () => Promise<TTSVoice[]>;
  getTTSVoicesForConfiguration: (configurationId: string) => Promise<TTSVoice[]>;
  synthesizeSpeech: (
    text: string,
    voice: string,
    speed?: number,
    configurationId?: string,
  ) => Promise<{ audioBase64: string; contentType: string } | null>;
}

export function useAI(): UseAIReturn {
  const client = useWildwood();
  const [sessions, setSessions] = useState<AISessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (request: AIChatRequest, options?: RequestOptions) => {
      setLoading(true);
      setError(null);
      try {
        return await client.ai.sendMessage(request, options);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI request failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  const sendMessageWithFile = useCallback(
    async (request: AIChatRequest, file: File | Blob, fileName?: string, options?: RequestOptions) => {
      setLoading(true);
      setError(null);
      try {
        return await client.ai.sendMessageWithFile(request, file, fileName, options);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI request failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  const sendProxyMessage = useCallback(
    async (request: AIChatRequest, options?: RequestOptions) => {
      setLoading(true);
      setError(null);
      try {
        return await client.ai.sendProxyMessage(request, options);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI request failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  const sendProxyMessageWithFile = useCallback(
    async (request: AIChatRequest, file: File | Blob, fileName?: string, options?: RequestOptions) => {
      setLoading(true);
      setError(null);
      try {
        return await client.ai.sendProxyMessageWithFile(request, file, fileName, options);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI request failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  const streamChat = useCallback(
    async (
      endpoint: string,
      request: OrchestratedChatRequest,
      handlers: OrchestratedChatHandlers,
      options?: { signal?: AbortSignal },
    ) => {
      // Mirror the sibling methods' loading/error handling so useAI().loading/error stay accurate,
      // while still forwarding every event to the caller's handlers.
      setLoading(true);
      setError(null);
      try {
        await streamOrchestratedChat({
          endpoint,
          request,
          handlers: {
            ...handlers,
            onError: (message) => {
              setError(message);
              handlers.onError?.(message);
            },
          },
          token: client.session.accessToken,
          signal: options?.signal,
        });
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  const getSessions = useCallback(async () => {
    const result = await client.ai.getSessions();
    setSessions(result);
    return result;
  }, [client]);

  const getSession = useCallback(
    async (sessionId: string) => {
      return client.ai.getSession(sessionId);
    },
    [client],
  );

  const createSession = useCallback(
    async (configName: string, title?: string) => {
      const session = await client.ai.createSession(configName, title);
      await getSessions();
      return session;
    },
    [client, getSessions],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await client.ai.deleteSession(sessionId);
      await getSessions();
    },
    [client, getSessions],
  );

  const endSession = useCallback(
    async (sessionId: string) => {
      return client.ai.endSession(sessionId);
    },
    [client],
  );

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      await client.ai.renameSession(sessionId, title);
      await getSessions();
    },
    [client, getSessions],
  );

  const getConfigurations = useCallback(
    async (configurationType?: string) => {
      return client.ai.getConfigurations(configurationType);
    },
    [client],
  );

  const getConfiguration = useCallback(
    async (name: string): Promise<AIConfiguration | null> => {
      // Resolve by configuration NAME. The core client.ai.getConfiguration() targets the by-id
      // route (configurations/{id}); passing a name there 404s and yields null. The list endpoint
      // is the only name-addressable source, so fetch and match by name (trimmed, case-insensitive).
      const target = name.trim().toLowerCase();
      const configs = await client.ai.getConfigurations();
      return configs.find((c) => c.name?.trim().toLowerCase() === target) ?? null;
    },
    [client],
  );

  const getTTSVoices = useCallback(async () => {
    return client.ai.getTTSVoices();
  }, [client]);

  const getTTSVoicesForConfiguration = useCallback(
    async (configurationId: string) => {
      return client.ai.getTTSVoicesForConfiguration(configurationId);
    },
    [client],
  );

  const synthesizeSpeech = useCallback(
    async (text: string, voice: string, speed?: number, configurationId?: string) => {
      return client.ai.synthesizeSpeech(text, voice, speed, configurationId);
    },
    [client],
  );

  return {
    sessions,
    loading,
    error,
    sendMessage,
    sendMessageWithFile,
    sendProxyMessage,
    sendProxyMessageWithFile,
    streamChat,
    getSessions,
    getSession,
    createSession,
    deleteSession,
    endSession,
    renameSession,
    getConfigurations,
    getConfiguration,
    getTTSVoices,
    getTTSVoicesForConfiguration,
    synthesizeSpeech,
  };
}
