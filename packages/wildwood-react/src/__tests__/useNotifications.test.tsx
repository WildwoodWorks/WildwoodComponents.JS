import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotifications } from '../hooks/useNotifications.js';
import { createWrapper } from './testUtils.js';

describe('useNotifications', () => {
  it('starts with empty toasts', () => {
    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });
    expect(result.current.toasts).toEqual([]);
  });

  it('shows a success notification', () => {
    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });
    act(() => {
      result.current.success('Test message');
    });
    expect(result.current.toasts.length).toBe(1);
    expect(result.current.toasts[0].message).toBe('Test message');
  });

  it('shows an error notification', () => {
    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });
    act(() => {
      result.current.error('Error occurred');
    });
    expect(result.current.toasts.length).toBe(1);
    expect(result.current.toasts[0].message).toBe('Error occurred');
  });

  it('dismisses a notification', () => {
    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });
    act(() => {
      result.current.success('To dismiss');
    });
    const id = result.current.toasts[0].id;
    act(() => {
      result.current.dismiss(id);
    });
    expect(result.current.toasts).toEqual([]);
  });

  it('clears all notifications', () => {
    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });
    act(() => {
      result.current.success('One');
      result.current.warning('Two');
      result.current.info('Three');
    });
    expect(result.current.toasts.length).toBe(3);
    act(() => {
      result.current.clear();
    });
    expect(result.current.toasts).toEqual([]);
  });
});
