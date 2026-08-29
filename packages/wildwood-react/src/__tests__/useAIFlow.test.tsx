import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { AIFlowModel, AIFlowRunResult } from '@wildwood/core';
import { useAIFlow } from '../hooks/useAIFlow.js';
import { createTestClient, createWrapper } from './testUtils.js';

const flow: AIFlowModel = {
  id: 'flow-1',
  name: 'Trail Forecast',
  description: 'Forecasts trail conditions',
  iconClass: '',
  inputFields: [],
};

const runResult: AIFlowRunResult = { status: 'succeeded', totalTokens: 0 };

// A stable identity: fetchImpl feeds the flow-load effect, so an inline function would
// reload the list every render.
const fetchImpl: typeof fetch = vi.fn();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAIFlow fetchImpl', () => {
  it('passes fetchImpl through to the getFlows request options', async () => {
    const client = createTestClient();
    const spy = vi.spyOn(client.aiFlow, 'getFlows').mockResolvedValue([flow]);

    const { result } = renderHook(() => useAIFlow({ apiBaseUrl: 'https://alt/api', fetchImpl }), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.loadingFlows).toBe(false));
    expect(spy).toHaveBeenCalledWith({ apiBaseUrl: 'https://alt/api', appId: undefined, fetchImpl });
  });

  it('passes fetchImpl through to the runFlow request options', async () => {
    const client = createTestClient();
    vi.spyOn(client.aiFlow, 'getFlows').mockResolvedValue([flow]);
    vi.spyOn(client.aiFlow, 'getThreadRuns').mockResolvedValue([]);
    const runSpy = vi.spyOn(client.aiFlow, 'runFlow').mockResolvedValue(runResult);

    const { result } = renderHook(() => useAIFlow({ fetchImpl }), { wrapper: createWrapper(client) });

    // A single flow auto-selects, so run() has a target.
    await waitFor(() => expect(result.current.selectedFlowId).toBe('flow-1'));

    await act(async () => {
      await result.current.run();
    });

    const options = runSpy.mock.calls[0][4];
    expect(options).toMatchObject({ fetchImpl });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it('omits fetchImpl when the caller does not supply one (global fetch stays the default)', async () => {
    const client = createTestClient();
    const spy = vi.spyOn(client.aiFlow, 'getFlows').mockResolvedValue([]);

    const { result } = renderHook(() => useAIFlow(), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.loadingFlows).toBe(false));
    expect(spy).toHaveBeenCalledWith({ apiBaseUrl: undefined, appId: undefined, fetchImpl: undefined });
  });
});
