import { useState, useCallback } from 'react';
import type {
  MessageThread,
  SecureMessage,
  CompanyAppUser,
  MessageSearchResult,
} from '@wildwood/core';
import { useWildwood } from './useWildwood';

export interface UseMessagingReturn {
  threads: MessageThread[];
  loading: boolean;
  error: string | null;
  getThreads: () => Promise<MessageThread[]>;
  getThread: (threadId: string) => Promise<MessageThread | null>;
  createThread: (participantIds: string[], subject: string) => Promise<MessageThread>;
  getMessages: (threadId: string, page?: number, pageSize?: number) => Promise<SecureMessage[]>;
  sendMessage: (threadId: string, content: string) => Promise<SecureMessage>;
  editMessage: (messageId: string, content: string) => Promise<SecureMessage>;
  deleteMessage: (messageId: string) => Promise<boolean>;
  reactToMessage: (messageId: string, emoji: string) => Promise<boolean>;
  removeReaction: (messageId: string, emoji: string) => Promise<boolean>;
  markThreadAsRead: (threadId: string) => Promise<boolean>;
  searchUsers: (query: string) => Promise<CompanyAppUser[]>;
  searchMessages: (query: string) => Promise<MessageSearchResult[]>;
}

export function useMessaging(): UseMessagingReturn {
  const client = useWildwood();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appId = client.config.appId ?? '';

  const getThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.messaging.getThreads(appId);
      setThreads(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load threads');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client, appId]);

  const getThread = useCallback(async (threadId: string) => {
    return client.messaging.getThread(threadId);
  }, [client]);

  const createThread = useCallback(async (participantIds: string[], subject: string) => {
    const thread = await client.messaging.createThread(appId, subject, participantIds);
    await getThreads();
    return thread;
  }, [client, appId, getThreads]);

  const getMessages = useCallback(async (threadId: string, page?: number, pageSize?: number) => {
    return client.messaging.getMessages(threadId, page, pageSize);
  }, [client]);

  const sendMessage = useCallback(async (threadId: string, content: string) => {
    return client.messaging.sendMessage(threadId, content);
  }, [client]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    return client.messaging.editMessage(messageId, content);
  }, [client]);

  const deleteMessage = useCallback(async (messageId: string) => {
    return client.messaging.deleteMessage(messageId);
  }, [client]);

  const reactToMessage = useCallback(async (messageId: string, emoji: string) => {
    return client.messaging.reactToMessage(messageId, emoji);
  }, [client]);

  const removeReaction = useCallback(async (messageId: string, emoji: string) => {
    return client.messaging.removeReaction(messageId, emoji);
  }, [client]);

  const markThreadAsRead = useCallback(async (threadId: string) => {
    return client.messaging.markThreadAsRead(threadId);
  }, [client]);

  const searchUsers = useCallback(async (query: string) => {
    return client.messaging.searchUsers(appId, query);
  }, [client, appId]);

  const searchMessages = useCallback(async (query: string) => {
    return client.messaging.searchMessages(appId, query);
  }, [client, appId]);

  return {
    threads, loading, error,
    getThreads, getThread, createThread, getMessages,
    sendMessage, editMessage, deleteMessage,
    reactToMessage, removeReaction, markThreadAsRead,
    searchUsers, searchMessages,
  };
}
