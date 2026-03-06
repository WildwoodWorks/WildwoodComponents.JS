// Messaging types - ported from WildwoodComponents.Blazor/Models/ComponentModels.cs

export enum MessageType {
  Text = 1,
  File = 2,
  Image = 3,
  System = 4,
}

export enum ThreadType {
  Direct = 1,
  Group = 2,
  Channel = 3,
}

export enum ParticipantRole {
  Member = 1,
  Admin = 2,
  Owner = 3,
}

export enum UserStatus {
  Available = 1,
  Busy = 2,
  Away = 3,
  DoNotDisturb = 4,
  Offline = 5,
}

export interface SecureMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  messageType: MessageType;
  createdAt: string;
  updatedAt?: string;
  isEdited: boolean;
  isDeleted: boolean;
  replyToMessageId?: string;
  attachments: MessageAttachment[];
  reactions: MessageReaction[];
  readReceipts: MessageReadReceipt[];
}

export interface MessageThread {
  id: string;
  companyAppId: string;
  subject: string;
  threadType: ThreadType;
  createdAt: string;
  lastActivity: string;
  isActive: boolean;
  lastMessagePreview?: string;
  unreadCount: number;
  participants: ThreadParticipant[];
  settings: ThreadSettings;
}

export interface ThreadParticipant {
  id: string;
  threadId: string;
  userId: string;
  userName: string;
  avatar?: string;
  role: ParticipantRole;
  joinedAt: string;
  leftAt?: string;
  isActive: boolean;
}

export interface ThreadSettings {
  id: string;
  threadId: string;
  allowFileSharing: boolean;
  allowReactions: boolean;
  notificationsEnabled: boolean;
  readReceiptsEnabled: boolean;
  maxParticipants: number;
  allowedFileTypes: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface MessageAttachment {
  id: string;
  messageId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  storagePath: string;
  thumbnailUrl?: string;
  createdAt: string;
}

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  userName: string;
  emoji: string;
  createdAt: string;
}

export interface MessageReadReceipt {
  id: string;
  messageId: string;
  userId: string;
  readAt: string;
}

export interface CompanyAppUser {
  id: string;
  companyAppId: string;
  userId: string;
  userName: string;
  email: string;
  avatar?: string;
  status: UserStatus;
  isActive: boolean;
  lastSeen: string;
}

export interface OnlineStatus {
  userId: string;
  isOnline: boolean;
  status: UserStatus;
  lastSeen: string;
  statusMessage?: string;
}

export interface TypingIndicator {
  userId: string;
  threadId: string;
  userName: string;
  isVisible: boolean;
  startedAt: string;
}

export interface SecureMessagingSettings {
  companyAppId: string;
  apiBaseUrl: string;
  enableEncryption: boolean;
  enableFileUploads: boolean;
  enableReactions: boolean;
  enableTypingIndicators: boolean;
  enableReadReceipts: boolean;
  enableNotifications: boolean;
  autoScrollToBottom: boolean;
  maxFileSize: number;
  maxMessageLength: number;
  messagesPerPage: number;
}

export interface NotificationSettings {
  desktopNotifications: boolean;
  soundNotifications: boolean;
  vibrateOnMobile: boolean;
  notificationSound: string;
}

export interface PendingAttachment {
  id: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  fileData?: ArrayBuffer;
  isUploading: boolean;
  uploadProgress: number;
}

export interface MessageSearchResult {
  messageId: string;
  threadId: string;
  content: string;
  senderName: string;
  createdAt: string;
  threadSubject: string;
}

export interface MessageDraft {
  threadId: string;
  content: string;
  replyToMessageId?: string;
  lastModified: string;
}
