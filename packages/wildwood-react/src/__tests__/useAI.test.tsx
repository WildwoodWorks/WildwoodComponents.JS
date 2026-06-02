import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAI } from '../hooks/useAI.js';
import { createWrapper, createTestClient } from './testUtils.js';

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

// Regression coverage for the AI spec-discovery bug: getConfiguration() is a BY-NAME lookup.
// It previously passed the name straight to the core by-id route (configurations/{id}), which 404s,
// so a correctly-configured "Spec Discovery" proxy config resolved to null and the import fallback
// reported "no AI configuration named ...". It must resolve via the list endpoint instead.
describe('useAI().getConfiguration (resolves by name, not by id)', () => {
  const CONFIGS = [
    { id: 'id-chat', name: 'Chat' },
    { id: 'id-spec', name: 'Spec Discovery' },
  ] as const;

  function setup(list: ReadonlyArray<{ id: string; name: string }> = CONFIGS) {
    const client = createTestClient();
    const listSpy = vi.spyOn(client.ai, 'getConfigurations').mockResolvedValue(list as never);
    // Spy on the core by-id primitive so we can assert the hook does NOT use it.
    const byIdSpy = vi.spyOn(client.ai, 'getConfiguration').mockResolvedValue(null as never);
    const { result } = renderHook(() => useAI(), { wrapper: createWrapper(client) });
    return { result, listSpy, byIdSpy };
  }

  it('returns the configuration whose name matches exactly', async () => {
    const { result } = setup();
    const cfg = await result.current.getConfiguration('Spec Discovery');
    expect(cfg?.id).toBe('id-spec');
  });

  it('matches case-insensitively and ignores surrounding whitespace', async () => {
    const { result } = setup();
    const cfg = await result.current.getConfiguration('  spec discovery  ');
    expect(cfg?.id).toBe('id-spec');
  });

  it('returns null when no configuration matches the name', async () => {
    const { result } = setup();
    const cfg = await result.current.getConfiguration('Nonexistent');
    expect(cfg).toBeNull();
  });

  it('resolves via the list endpoint and never the by-id route (regression)', async () => {
    const { result, listSpy, byIdSpy } = setup();
    await result.current.getConfiguration('Spec Discovery');
    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(byIdSpy).not.toHaveBeenCalled();
  });
});
