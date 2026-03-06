import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../hooks/useTheme.js';
import { createWrapper } from './testUtils.js';

describe('useTheme', () => {
  it('exposes setTheme function', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: createWrapper() });
    expect(typeof result.current.setTheme).toBe('function');
  });

  it('exposes theme value', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: createWrapper() });
    expect(result.current).toHaveProperty('theme');
  });

  it('setTheme does not throw', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.setTheme('dark');
    });
  });
});
