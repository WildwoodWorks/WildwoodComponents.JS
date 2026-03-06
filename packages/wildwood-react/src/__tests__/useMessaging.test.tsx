import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMessaging } from '../hooks/useMessaging.js';
import { createWrapper } from './testUtils.js';

describe('useMessaging', () => {
  it('starts with empty threads', () => {
    const { result } = renderHook(() => useMessaging(), { wrapper: createWrapper() });
    expect(result.current.threads).toEqual([]);
  });

  it('starts with disconnected connection state', () => {
    const { result } = renderHook(() => useMessaging(), { wrapper: createWrapper() });
    expect(result.current.connectionState).toBe('disconnected');
  });

  it('starts not loading', () => {
    const { result } = renderHook(() => useMessaging(), { wrapper: createWrapper() });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('exposes all messaging methods', () => {
    const { result } = renderHook(() => useMessaging(), { wrapper: createWrapper() });
    expect(typeof result.current.connect).toBe('function');
    expect(typeof result.current.disconnect).toBe('function');
    expect(typeof result.current.getThreads).toBe('function');
    expect(typeof result.current.getThread).toBe('function');
    expect(typeof result.current.createThread).toBe('function');
    expect(typeof result.current.getMessages).toBe('function');
    expect(typeof result.current.sendMessage).toBe('function');
    expect(typeof result.current.editMessage).toBe('function');
    expect(typeof result.current.deleteMessage).toBe('function');
    expect(typeof result.current.reactToMessage).toBe('function');
    expect(typeof result.current.removeReaction).toBe('function');
    expect(typeof result.current.markMessageAsRead).toBe('function');
    expect(typeof result.current.markThreadAsRead).toBe('function');
    expect(typeof result.current.searchUsers).toBe('function');
    expect(typeof result.current.getCompanyAppUsers).toBe('function');
    expect(typeof result.current.searchMessages).toBe('function');
    expect(typeof result.current.startTyping).toBe('function');
    expect(typeof result.current.stopTyping).toBe('function');
    expect(typeof result.current.getTypingIndicators).toBe('function');
    expect(typeof result.current.downloadAttachment).toBe('function');
    expect(typeof result.current.updateOnlineStatus).toBe('function');
    expect(typeof result.current.getOnlineStatuses).toBe('function');
    expect(typeof result.current.onMessage).toBe('function');
    expect(typeof result.current.onTyping).toBe('function');
    expect(typeof result.current.onStatusChange).toBe('function');
  });

  it('onMessage returns cleanup function', () => {
    const { result } = renderHook(() => useMessaging(), { wrapper: createWrapper() });
    const cleanup = result.current.onMessage(() => {});
    expect(typeof cleanup).toBe('function');
    cleanup();
  });
});
