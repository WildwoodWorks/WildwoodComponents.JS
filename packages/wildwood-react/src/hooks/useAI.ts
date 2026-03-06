import { useState, useCallback } from 'react';
import type {
  AIChatRequest,
  AIChatResponse,
  AISession,
  AISessionSummary,
  AIConfiguration,
} from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseAIReturn {
  sessions: AISessionSummary[];
  loading: boolean;
  error: string | null;
  sendMessage: (request: AIChatRequest) => Promise<AIChatResponse>;
  getSessions: () => Promise<AISessionSummary[]>;
  getSession: (sessionId: string) => Promise<AISession | null>;
  createSession: (configName: string, title?: string) => Promise<AISession | null>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  getConfigurations: () => Promise<AIConfiguration[]>;
  getConfiguration: (name: string) => Promise<AIConfiguration | null>;
}

export function useAI(): UseAIReturn {
  const client = useWildwood();
  const [sessions, setSessions] = useState<AISessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (request: AIChatRequest) => {
    setLoading(true);
    setError(null);
    try {
      return await client.ai.sendMessage(request);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI request failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  const getSessions = useCallback(async () => {
    const result = await client.ai.getSessions();
    setSessions(result);
    return result;
  }, [client]);

  const getSession = useCallback(async (sessionId: string) => {
    return client.ai.getSession(sessionId);
  }, [client]);

  const createSession = useCallback(async (configName: string, title?: string) => {
    const session = await client.ai.createSession(configName, title);
    await getSessions();
    return session;
  }, [client, getSessions]);

  const deleteSession = useCallback(async (sessionId: string) => {
    await client.ai.deleteSession(sessionId);
    await getSessions();
  }, [client, getSessions]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    await client.ai.renameSession(sessionId, title);
    await getSessions();
  }, [client, getSessions]);

  const getConfigurations = useCallback(async () => {
    return client.ai.getConfigurations();
  }, [client]);

  const getConfiguration = useCallback(async (name: string) => {
    return client.ai.getConfiguration(name);
  }, [client]);

  return {
    sessions,
    loading,
    error,
    sendMessage,
    getSessions,
    getSession,
    createSession,
    deleteSession,
    renameSession,
    getConfigurations,
    getConfiguration,
  };
}
