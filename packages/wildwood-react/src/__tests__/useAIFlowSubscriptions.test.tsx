import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { AIFlowSubscription } from '@wildwood/core';
import { useAIFlowSubscriptions } from '../hooks/useAIFlowSubscriptions.js';
import { createTestClient, createWrapper } from './testUtils.js';

const sub: AIFlowSubscription = {
  id: 'sub-1',
  flowId: 'flow-1',
  flowName: 'Trail Forecast',
  name: 'Angels Landing',
  isEnabled: true,
  notifyOnComplete: true,
  createdAt: '2026-07-12T00:00:00Z',
};

const createRequest = { flowId: 'flow-1', name: 'Angels Landing', scheduleCron: '0 6 * * *' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAIFlowSubscriptions', () => {
  it('loads subscriptions on mount and clears loading', async () => {
    const client = createTestClient();
    vi.spyOn(client.aiFlowSubscription, 'getSubscriptions').mockResolvedValue([sub]);

    const { result } = renderHook(() => useAIFlowSubscriptions(), { wrapper: createWrapper(client) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.subscriptions).toHaveLength(1);
    expect(result.current.subscriptions[0].id).toBe('sub-1');
    expect(result.current.error).toBeNull();
  });

  it('refreshes the list after a successful create and leaves error/limitMessage null', async () => {
    const client = createTestClient();
    const listSpy = vi.spyOn(client.aiFlowSubscription, 'getSubscriptions').mockResolvedValue([]);
    vi.spyOn(client.aiFlowSubscription, 'create').mockResolvedValue(sub);

    const { result } = renderHook(() => useAIFlowSubscriptions(), { wrapper: createWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    listSpy.mockResolvedValue([sub]); // the post-create refresh sees the new row
    let created: AIFlowSubscription | null = null;
    await act(async () => {
      created = await result.current.create(createRequest);
    });

    expect(created).not.toBeNull();
    expect(result.current.subscriptions).toHaveLength(1);
    expect(result.current.error).toBeNull();
    expect(result.current.limitMessage).toBeNull();
  });

  it('surfaces the plan-limit copy via limitMessage on a 429 create, without a generic error', async () => {
    const client = createTestClient();
    vi.spyOn(client.aiFlowSubscription, 'getSubscriptions').mockResolvedValue([]);
    vi.spyOn(client.aiFlowSubscription, 'create').mockImplementation(async () => {
      // The service records the server's limit copy on a 429 and returns null.
      client.aiFlowSubscription.lastLimitMessage = 'Upgrade to schedule more flows.';
      return null;
    });

    const { result } = renderHook(() => useAIFlowSubscriptions(), { wrapper: createWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.create(createRequest);
    });

    expect(result.current.limitMessage).toBe('Upgrade to schedule more flows.');
    expect(result.current.error).toBeNull();
  });

  it('sets error when a create fails without a limit message', async () => {
    const client = createTestClient();
    vi.spyOn(client.aiFlowSubscription, 'getSubscriptions').mockResolvedValue([]);
    vi.spyOn(client.aiFlowSubscription, 'create').mockResolvedValue(null);

    const { result } = renderHook(() => useAIFlowSubscriptions(), { wrapper: createWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.create(createRequest);
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.limitMessage).toBeNull();
  });

  it('refreshes on a successful remove and sets error on a failed remove', async () => {
    const client = createTestClient();
    const listSpy = vi.spyOn(client.aiFlowSubscription, 'getSubscriptions').mockResolvedValue([sub]);
    const deleteSpy = vi.spyOn(client.aiFlowSubscription, 'delete').mockResolvedValue(true);

    const { result } = renderHook(() => useAIFlowSubscriptions(), { wrapper: createWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    listSpy.mockResolvedValue([]); // the post-delete refresh sees an empty list
    await act(async () => {
      await result.current.remove('sub-1');
    });
    expect(result.current.subscriptions).toHaveLength(0);
    expect(result.current.error).toBeNull();

    deleteSpy.mockResolvedValue(false);
    await act(async () => {
      await result.current.remove('sub-1');
    });
    expect(result.current.error).not.toBeNull();
  });
});
