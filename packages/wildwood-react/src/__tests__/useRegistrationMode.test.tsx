/**
 * The registration mode is read fresh on every mount: an operator who has just turned open
 * registration off expects the next visitor to see the closed screen, not a cached one.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { AuthenticationConfiguration } from '@wildwood/core';
import { useRegistrationMode } from '@wildwood/react-shared';
import { createTestClient, createWrapper } from './testUtils.js';

const authConfig = (allowOpenRegistration: boolean, allowTokenRegistration: boolean) =>
  ({ allowOpenRegistration, allowTokenRegistration }) as AuthenticationConfiguration;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRegistrationMode', () => {
  it('reads the live settings on every mount', async () => {
    const client = createTestClient();
    const spy = vi.spyOn(client.auth, 'getAuthenticationConfiguration').mockResolvedValue(authConfig(true, true));
    const wrapper = createWrapper(client);

    const first = renderHook(() => useRegistrationMode('app-1'), { wrapper });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.mode).toMatchObject({
      closed: false,
      allowOpenRegistration: true,
      showOptionalTokenEntry: true,
      source: 'config',
    });
    expect(spy).toHaveBeenCalledWith('app-1');
    expect(spy).toHaveBeenCalledTimes(1);

    // The operator closes registration; the next mount sees it.
    spy.mockResolvedValue(authConfig(false, false));
    const second = renderHook(() => useRegistrationMode('app-1'), { wrapper });
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    expect(spy).toHaveBeenCalledTimes(2);
    expect(second.result.current.mode.closed).toBe(true);
  });

  it('falls back to open sign-up when the settings cannot be read', async () => {
    const client = createTestClient();
    // Core swallows the transport failure and answers null.
    vi.spyOn(client.auth, 'getAuthenticationConfiguration').mockResolvedValue(null);

    const { result } = renderHook(() => useRegistrationMode('app-1'), { wrapper: createWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.config).toBeNull();
    expect(result.current.mode).toEqual({
      closed: false,
      requireToken: false,
      allowOpenRegistration: true,
      showOptionalTokenEntry: true,
      source: 'fallback',
    });
  });

  it("tokenMode 'required' forces the token path over a closed configuration", async () => {
    const client = createTestClient();
    vi.spyOn(client.auth, 'getAuthenticationConfiguration').mockResolvedValue(authConfig(false, false));

    const { result } = renderHook(() => useRegistrationMode('app-1', { tokenMode: 'required' }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.mode).toEqual({
      closed: false,
      requireToken: true,
      allowOpenRegistration: false,
      showOptionalTokenEntry: false,
      source: 'tokenMode',
    });
  });

  it('is loading until the fetch settles, so a view can wait', async () => {
    const client = createTestClient();
    let release: (value: AuthenticationConfiguration | null) => void = () => {};
    vi.spyOn(client.auth, 'getAuthenticationConfiguration').mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const { result } = renderHook(() => useRegistrationMode('app-1'), { wrapper: createWrapper(client) });
    expect(result.current.loading).toBe(true);
    // The fallback mode is what a view would render if it ignored `loading`.
    expect(result.current.mode.source).toBe('fallback');

    release(authConfig(true, false));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.mode.showOptionalTokenEntry).toBe(false);
  });

  it('makes no request while it is disabled', async () => {
    const client = createTestClient();
    const spy = vi.spyOn(client.auth, 'getAuthenticationConfiguration').mockResolvedValue(authConfig(true, true));

    const { result } = renderHook(() => useRegistrationMode('app-1', { enabled: false }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(spy).not.toHaveBeenCalled();
  });
});
