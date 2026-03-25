'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  MessageThread,
  SecureMessage,
  CompanyAppUser,
  MessageSearchResult,
  MessageDraft,
  TypingIndicator,
  OnlineStatus,
  UserStatus,
  SignalRConnectionState,
} from '@wildwood/core';
import { createSignalRManager } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseMessagingReturn {
  threads: MessageThread[];
  loading: boolean;
  error: string | null;
  connectionState: SignalRConnectionState;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  getThreads: () => Promise<MessageThread[]>;
  getThread: (threadId: string) => Promise<MessageThread | null>;
  createThread: (participantIds: string[], subject: string) => Promise<MessageThread>;
  getMessages: (threadId: string, page?: number, pageSize?: number) => Promise<SecureMessage[]>;
  sendMessage: (threadId: string, content: string, replyToMessageId?: string) => Promise<SecureMessage>;
  uploadAttachment: (
    threadId: string,
    file: File,
  ) => Promise<{ attachmentId: string; fileName: string; fileSize: number; contentType: string }>;
  editMessage: (messageId: string, content: string) => Promise<SecureMessage>;
  deleteMessage: (messageId: string) => Promise<boolean>;
  reactToMessage: (messageId: string, emoji: string) => Promise<boolean>;
  removeReaction: (messageId: string, emoji: string) => Promise<boolean>;
  markMessageAsRead: (messageId: string) => Promise<boolean>;
  markThreadAsRead: (threadId: string) => Promise<boolean>;
  searchUsers: (query: string) => Promise<CompanyAppUser[]>;
  getCompanyAppUsers: () => Promise<CompanyAppUser[]>;
  searchMessages: (query: string) => Promise<MessageSearchResult[]>;
  startTyping: (threadId: string) => Promise<boolean>;
  stopTyping: (threadId: string) => Promise<boolean>;
  getTypingIndicators: (threadId: string) => Promise<TypingIndicator[]>;
  downloadAttachment: (attachmentId: string) => Promise<ArrayBuffer>;
  updateOnlineStatus: (status: UserStatus, statusMessage?: string) => Promise<boolean>;
  getOnlineStatuses: () => Promise<OnlineStatus[]>;
  saveDraft: (threadId: string, content: string, replyToMessageId?: string) => Promise<void>;
  getDraft: (threadId: string) => Promise<MessageDraft | null>;
  clearDraft: (threadId: string) => Promise<void>;
  onMessage: (handler: (message: SecureMessage) => void) => () => void;
  onTyping: (handler: (indicator: TypingIndicator) => void) => () => void;
  onStatusChange: (handler: (status: OnlineStatus) => void) => () => void;
}

export function useMessaging(): UseMessagingReturn {
  const client = useWildwood();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<SignalRConnectionState>('disconnected');
  const signalRRef = useRef<ReturnType<typeof createSignalRManager> | null>(null);

  const appId = client.config.appId ?? '';

  useEffect(() => {
    const baseUrl = client.config.baseUrl?.replace(/\/$/, '') ?? '';
    const manager = createSignalRManager({
      hubUrl: `${baseUrl}/hubs/messaging`,
      getAccessToken: async () => {
        const token = client.session.accessToken;
        return token ?? null;
      },
      autoReconnect: true,
    });

    const unsubState = manager.onStateChange(setConnectionState);
    signalRRef.current = manager;

    return () => {
      unsubState();
      manager.disconnect();
      signalRRef.current = null;
    };
  }, [client]);

  const connect = useCallback(async () => {
    await signalRRef.current?.connect();
  }, []);

  const disconnect = useCallback(async () => {
    await signalRRef.current?.disconnect();
  }, []);

  const onMessage = useCallback((handler: (message: SecureMessage) => void) => {
    const mgr = signalRRef.current;
    if (!mgr) return () => {};
    const wrappedHandler = (...args: unknown[]) => {
      if (args[0] != null && typeof args[0] === 'object') {
        handler(args[0] as SecureMessage);
      }
    };
    mgr.on('ReceiveMessage', wrappedHandler);
    return () => mgr.off('ReceiveMessage', wrappedHandler);
  }, []);

  const onTyping = useCallback((handler: (indicator: TypingIndicator) => void) => {
    const mgr = signalRRef.current;
    if (!mgr) return () => {};
    const wrappedHandler = (...args: unknown[]) => {
      if (args[0] != null && typeof args[0] === 'object') {
        handler(args[0] as TypingIndicator);
      }
    };
    mgr.on('TypingIndicator', wrappedHandler);
    return () => mgr.off('TypingIndicator', wrappedHandler);
  }, []);

  const onStatusChange = useCallback((handler: (status: OnlineStatus) => void) => {
    const mgr = signalRRef.current;
    if (!mgr) return () => {};
    const wrappedHandler = (...args: unknown[]) => {
      if (args[0] != null && typeof args[0] === 'object') {
        handler(args[0] as OnlineStatus);
      }
    };
    mgr.on('UserStatusChanged', wrappedHandler);
    return () => mgr.off('UserStatusChanged', wrappedHandler);
  }, []);

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

  const getThread = useCallback(
    async (threadId: string) => {
      return client.messaging.getThread(threadId);
    },
    [client],
  );

  const createThread = useCallback(
    async (participantIds: string[], subject: string) => {
      const thread = await client.messaging.createThread(appId, subject, participantIds);
      await getThreads();
      return thread;
    },
    [client, appId, getThreads],
  );

  const getMessages = useCallback(
    async (threadId: string, page?: number, pageSize?: number) => {
      return client.messaging.getMessages(threadId, page, pageSize);
    },
    [client],
  );

  const sendMessage = useCallback(
    async (threadId: string, content: string, replyToMessageId?: string) => {
      return client.messaging.sendMessage(threadId, content, undefined, replyToMessageId);
    },
    [client],
  );

  const uploadAttachment = useCallback(
    async (threadId: string, file: File) => {
      return client.messaging.uploadAttachment(threadId, file);
    },
    [client],
  );

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      return client.messaging.editMessage(messageId, content);
    },
    [client],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      return client.messaging.deleteMessage(messageId);
    },
    [client],
  );

  const reactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      return client.messaging.reactToMessage(messageId, emoji);
    },
    [client],
  );

  const removeReaction = useCallback(
    async (messageId: string, emoji: string) => {
      return client.messaging.removeReaction(messageId, emoji);
    },
    [client],
  );

  const markMessageAsRead = useCallback(
    async (messageId: string) => {
      return client.messaging.markMessageAsRead(messageId);
    },
    [client],
  );

  const markThreadAsRead = useCallback(
    async (threadId: string) => {
      return client.messaging.markThreadAsRead(threadId);
    },
    [client],
  );

  const searchUsers = useCallback(
    async (query: string) => {
      return client.messaging.searchUsers(appId, query);
    },
    [client, appId],
  );

  const getCompanyAppUsers = useCallback(async () => {
    return client.messaging.getCompanyAppUsers(appId);
  }, [client, appId]);

  const searchMessages = useCallback(
    async (query: string) => {
      return client.messaging.searchMessages(appId, query);
    },
    [client, appId],
  );

  const startTyping = useCallback(
    async (threadId: string) => {
      return client.messaging.startTyping(threadId);
    },
    [client],
  );

  const stopTyping = useCallback(
    async (threadId: string) => {
      return client.messaging.stopTyping(threadId);
    },
    [client],
  );

  const getTypingIndicators = useCallback(
    async (threadId: string) => {
      return client.messaging.getTypingIndicators(threadId);
    },
    [client],
  );

  const downloadAttachment = useCallback(
    async (attachmentId: string) => {
      return client.messaging.downloadAttachment(attachmentId);
    },
    [client],
  );

  const updateOnlineStatus = useCallback(
    async (status: UserStatus, statusMessage?: string) => {
      return client.messaging.updateOnlineStatus(appId, status, statusMessage);
    },
    [client, appId],
  );

  const getOnlineStatuses = useCallback(async () => {
    return client.messaging.getOnlineStatuses(appId);
  }, [client, appId]);

  const saveDraft = useCallback(
    async (threadId: string, content: string, replyToMessageId?: string) => {
      return client.messaging.saveDraft(threadId, content, replyToMessageId);
    },
    [client],
  );

  const getDraft = useCallback(
    async (threadId: string) => {
      return client.messaging.getDraft(threadId);
    },
    [client],
  );

  const clearDraft = useCallback(
    async (threadId: string) => {
      return client.messaging.clearDraft(threadId);
    },
    [client],
  );

  return {
    threads,
    loading,
    error,
    connectionState,
    connect,
    disconnect,
    getThreads,
    getThread,
    createThread,
    getMessages,
    sendMessage,
    uploadAttachment,
    editMessage,
    deleteMessage,
    reactToMessage,
    removeReaction,
    markMessageAsRead,
    markThreadAsRead,
    searchUsers,
    getCompanyAppUsers,
    searchMessages,
    startTyping,
    stopTyping,
    getTypingIndicators,
    downloadAttachment,
    updateOnlineStatus,
    getOnlineStatuses,
    saveDraft,
    getDraft,
    clearDraft,
    onMessage,
    onTyping,
    onStatusChange,
  };
}
