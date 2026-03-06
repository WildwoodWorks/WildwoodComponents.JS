// Notification types - ported from WildwoodComponents.Blazor/Models/ComponentModels.cs

export enum NotificationType {
  Info = 'Info',
  Success = 'Success',
  Warning = 'Warning',
  Error = 'Error',
}

export enum NotificationActionStyle {
  Primary = 'Primary',
  Secondary = 'Secondary',
  Success = 'Success',
  Danger = 'Danger',
  Warning = 'Warning',
  Info = 'Info',
  Light = 'Light',
  Dark = 'Dark',
}

export enum NotificationPosition {
  TopLeft = 'TopLeft',
  TopRight = 'TopRight',
  TopCenter = 'TopCenter',
  BottomLeft = 'BottomLeft',
  BottomRight = 'BottomRight',
  BottomCenter = 'BottomCenter',
}

export interface ToastNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  timestamp?: string;
  isVisible: boolean;
  isDismissible: boolean;
  duration?: number;
  cssClass?: string;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  id: string;
  text: string;
  style: NotificationActionStyle;
  dismissOnClick: boolean;
  data?: Record<string, unknown>;
}

export interface NotificationActionArgs {
  notificationId: string;
  actionId: string;
  actionText: string;
  data?: Record<string, unknown>;
}
