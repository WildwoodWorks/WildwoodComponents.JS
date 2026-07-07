import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { UserNotificationPreference } from '@wildwood/core';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences.js';
import { createTestClient, createWrapper } from './testUtils.js';

const loadedPref: UserNotificationPreference = {
  appId: 'test-app-id',
  emailEnabled: true,
  smsEnabled: true,
  pushEnabled: false,
  browserEnabled: true,
  eventOptOutsJson: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useNotificationPreferences', () => {
  it('loads preferences on mount', async () => {
    const client = createTestClient();
    vi.spyOn(client.notificationInbox, 'getPreferences').mockResolvedValue(loadedPref);

    const { result } = renderHook(() => useNotificationPreferences('test-app-id'), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.preferences).toEqual(loadedPref);
  });

  it('retains the previously-loaded preferences when a refresh returns a transient failure (null)', async () => {
    const client = createTestClient();
    const spy = vi.spyOn(client.notificationInbox, 'getPreferences').mockResolvedValue(loadedPref);

    const { result } = renderHook(() => useNotificationPreferences('test-app-id'), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.preferences).toEqual(loadedPref);

    // Transient blip: the service signals failure with null.
    spy.mockResolvedValue(null);
    await act(async () => {
      await result.current.refresh();
    });

    // Prior preferences are retained — browserEnabled did NOT flip back to a default.
    expect(result.current.preferences).toEqual(loadedPref);
  });
});
