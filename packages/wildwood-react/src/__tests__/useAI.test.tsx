import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAI } from '../hooks/useAI.js';
import { createWrapper } from './testUtils.js';

describe('useAI', () => {
  it('starts with empty sessions', () => {
    const { result } = renderHook(() => useAI(), { wrapper: createWrapper() });
    expect(result.current.sessions).toEqual([]);
  });

  it('starts not loading with no error', () => {
    const { result } = renderHook(() => useAI(), { wrapper: createWrapper() });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('exposes all AI methods including TTS', () => {
    const { result } = renderHook(() => useAI(), { wrapper: createWrapper() });
    expect(typeof result.current.sendMessage).toBe('function');
    expect(typeof result.current.getSessions).toBe('function');
    expect(typeof result.current.getSession).toBe('function');
    expect(typeof result.current.createSession).toBe('function');
    expect(typeof result.current.deleteSession).toBe('function');
    expect(typeof result.current.endSession).toBe('function');
    expect(typeof result.current.renameSession).toBe('function');
    expect(typeof result.current.getConfigurations).toBe('function');
    expect(typeof result.current.getConfiguration).toBe('function');
    expect(typeof result.current.getTTSVoices).toBe('function');
    expect(typeof result.current.getTTSVoicesForConfiguration).toBe('function');
    expect(typeof result.current.synthesizeSpeech).toBe('function');
  });
});
