'use client';

import { useEffect, useRef } from 'react';
import { useNotifications } from '../../hooks/useNotifications.js';

export interface NotificationToastComponentProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  maxToasts?: number;
  className?: string;
}

export function NotificationToastComponent({
  position = 'top-right',
  maxToasts = 5,
  className,
}: NotificationToastComponentProps) {
  const { toasts, dismiss } = useNotifications();
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const visibleToasts = toasts.slice(0, maxToasts);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const getTypeClass = (type: string) => {
    switch (type) {
      case 'success':
        return 'ww-toast-success';
      case 'error':
        return 'ww-toast-error';
      case 'warning':
        return 'ww-toast-warning';
      case 'info':
        return 'ww-toast-info';
      default:
        return 'ww-toast-info';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'success':
        return '\u2713';
      case 'error':
        return '\u2717';
      case 'warning':
        return '\u26A0';
      case 'info':
        return '\u2139';
      default:
        return '\u2139';
    }
  };

  return (
    <div className={`ww-toast-container ww-toast-${position} ${className ?? ''}`}>
      {visibleToasts.map((toast) => (
        <div key={toast.id} className={`ww-toast ${getTypeClass(toast.type)}`} role="alert">
          <div className="ww-toast-icon">{getTypeIcon(toast.type)}</div>
          <div className="ww-toast-content">
            {toast.title && <div className="ww-toast-title">{toast.title}</div>}
            <div className="ww-toast-message">{toast.message}</div>
          </div>
          <button type="button" className="ww-toast-close" onClick={() => dismiss(toast.id)} aria-label="Close">
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
