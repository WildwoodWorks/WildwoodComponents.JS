// Messaging service - ported from WildwoodComponents.Blazor/Services/SecureMessagingService.cs

import type { HttpClient } from '../client/httpClient.js';
import type { StorageAdapter } from '../platform/types.js';
import {
  type MessageThread,
  type SecureMessage,
  type CompanyAppUser,
  type TypingIndicator,
  type OnlineStatus,
  type MessageSearchResult,
  type MessageDraft,
  type UserStatus,
  ThreadType,
  MessageType,
} from './types.js';

const DRAFT_STORAGE_PREFIX = 'ww_draft_';

export class MessagingService {
  constructor(
    private http: HttpClient,
    private storage?: StorageAdapter,
  ) {}

  // Threads
  async getThreads(companyAppId: string): Promise<MessageThread[]> {
    const { data } = await this.http.get<MessageThread[]>(`api/messaging/${companyAppId}/threads`);
    return data ?? [];
  }

  async getThread(threadId: string): Promise<MessageThread | null> {
    try {
      const { data } = await this.http.get<MessageThread>(`api/messaging/threads/${threadId}`);
      return data ?? null;
    } catch {
      return null;
    }
  }

  async createThread(
    companyAppId: string,
    subject: string,
    participantIds: string[],
    threadType: ThreadType = ThreadType.Direct,
  ): Promise<MessageThread> {
    const { data } = await this.http.post<MessageThread>(`api/messaging/${companyAppId}/threads`, {
      subject,
      participantIds,
      threadType,
    });
    return data;
  }

  // Messages
  async getMessages(threadId: string, page = 1, pageSize = 50): Promise<SecureMessage[]> {
    const { data } = await this.http.get<SecureMessage[]>(
      `api/messaging/threads/${threadId}/messages?page=${page}&pageSize=${pageSize}`,
    );
    return data ?? [];
  }

  async sendMessage(
    threadId: string,
    content: string,
    messageType: MessageType = MessageType.Text,
    replyToMessageId?: string,
  ): Promise<SecureMessage> {
    const { data } = await this.http.post<SecureMessage>(`api/messaging/threads/${threadId}/messages`, {
      content,
      messageType,
      replyToMessageId,
    });
    return data;
  }

  async editMessage(messageId: string, newContent: string): Promise<SecureMessage> {
    const { data } = await this.http.put<SecureMessage>(`api/messaging/messages/${messageId}`, {
      content: newContent,
    });
    return data;
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    try {
      await this.http.delete(`api/messaging/messages/${messageId}`);
      return true;
    } catch {
      return false;
    }
  }

  // Reactions
  async reactToMessage(messageId: string, emoji: string): Promise<boolean> {
    try {
      await this.http.post(`api/messaging/messages/${messageId}/reactions`, { emoji });
      return true;
    } catch {
      return false;
    }
  }

  async removeReaction(messageId: string, emoji: string): Promise<boolean> {
    try {
      await this.http.delete(`api/messaging/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
      return true;
    } catch {
      return false;
    }
  }

  // Read receipts
  async markMessageAsRead(messageId: string): Promise<boolean> {
    try {
      await this.http.post(`api/messaging/messages/${messageId}/read`);
      return true;
    } catch {
      return false;
    }
  }

  async markThreadAsRead(threadId: string): Promise<boolean> {
    try {
      await this.http.post(`api/messaging/threads/${threadId}/read`);
      return true;
    } catch {
      return false;
    }
  }

  // Users
  async getCompanyAppUsers(companyAppId: string): Promise<CompanyAppUser[]> {
    const { data } = await this.http.get<CompanyAppUser[]>(`api/messaging/${companyAppId}/users`);
    return data ?? [];
  }

  async searchUsers(companyAppId: string, searchTerm: string): Promise<CompanyAppUser[]> {
    const { data } = await this.http.get<CompanyAppUser[]>(
      `api/messaging/${companyAppId}/users/search?q=${encodeURIComponent(searchTerm)}`,
    );
    return data ?? [];
  }

  // Typing indicators
  async startTyping(threadId: string): Promise<boolean> {
    try {
      await this.http.post(`api/messaging/threads/${threadId}/typing/start`);
      return true;
    } catch {
      return false;
    }
  }

  async stopTyping(threadId: string): Promise<boolean> {
    try {
      await this.http.post(`api/messaging/threads/${threadId}/typing/stop`);
      return true;
    } catch {
      return false;
    }
  }

  async getTypingIndicators(threadId: string): Promise<TypingIndicator[]> {
    const { data } = await this.http.get<TypingIndicator[]>(`api/messaging/threads/${threadId}/typing`);
    return data ?? [];
  }

  // Attachments
  async downloadAttachment(attachmentId: string): Promise<ArrayBuffer> {
    const { data } = await this.http.get<ArrayBuffer>(`api/messaging/attachments/${attachmentId}/download`);
    return data;
  }

  async uploadAttachment(
    threadId: string,
    file: File,
  ): Promise<{ attachmentId: string; fileName: string; fileSize: number; contentType: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await this.http.post<{
      attachmentId: string;
      fileName: string;
      fileSize: number;
      contentType: string;
    }>(`api/messaging/threads/${threadId}/attachments`, formData);
    return data;
  }

  // Search
  async searchMessages(companyAppId: string, searchTerm: string, threadId?: string): Promise<MessageSearchResult[]> {
    let url = `api/messaging/${companyAppId}/search?q=${encodeURIComponent(searchTerm)}`;
    if (threadId) url += `&threadId=${encodeURIComponent(threadId)}`;
    const { data } = await this.http.get<MessageSearchResult[]>(url);
    return data ?? [];
  }

  // Online status
  async updateOnlineStatus(companyAppId: string, status: UserStatus, statusMessage?: string): Promise<boolean> {
    try {
      await this.http.post(`api/messaging/${companyAppId}/status`, { status, statusMessage });
      return true;
    } catch {
      return false;
    }
  }

  async getOnlineStatuses(companyAppId: string): Promise<OnlineStatus[]> {
    const { data } = await this.http.get<OnlineStatus[]>(`api/messaging/${companyAppId}/statuses`);
    return data ?? [];
  }

  // Draft management (client-side, mirrors Blazor's localStorage-based drafts)
  async saveDraft(threadId: string, content: string, replyToMessageId?: string): Promise<void> {
    if (!this.storage) return;
    const draft: MessageDraft = {
      threadId,
      content,
      replyToMessageId,
      lastModified: new Date().toISOString(),
    };
    await this.storage.setItem(`${DRAFT_STORAGE_PREFIX}${threadId}`, JSON.stringify(draft));
  }

  async getDraft(threadId: string): Promise<MessageDraft | null> {
    if (!this.storage) return null;
    const raw = await this.storage.getItem(`${DRAFT_STORAGE_PREFIX}${threadId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as MessageDraft;
    } catch {
      return null;
    }
  }

  async clearDraft(threadId: string): Promise<void> {
    if (!this.storage) return;
    await this.storage.removeItem(`${DRAFT_STORAGE_PREFIX}${threadId}`);
  }
}
