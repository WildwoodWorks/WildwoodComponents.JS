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
