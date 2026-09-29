import { describe, it, expect, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import { AttributionService } from '@wildwood/core';
import { WildwoodProvider } from '../provider/WildwoodProvider.js';
import { useAttribution } from '../hooks/useAttribution.js';
import { createTestClient, createWrapper } from './testUtils.js';

describe('useAttribution', () => {
  it('re-renders when a touch is captured and when it is cleared', () => {
    const client = createTestClient();
    const { result } = renderHook(() => useAttribution(), { wrapper: createWrapper(client) });
    expect(result.current.touch).toBeNull();

    act(() => {
      result.current.captureUrl(
        'https://cairnfed.ai/?utm_source=reddit&utm_medium=paid&utm_campaign=govcon-test-sep26',
      );
    });

    expect(result.current.touch?.campaign).toBe('govcon-test-sep26');
    expect(result.current.getForRegistration()?.lastTouch?.source).toBe('reddit');

    act(() => {
      result.current.clear();
    });

    expect(result.current.touch).toBeNull();
    expect(result.current.getForRegistration()).toBeNull();
  });
});

describe('useAttribution funnel tracking', () => {
  it('hands out stable track, trackCta and flush bound to the client', async () => {
    const client = createTestClient();
    const track = vi.spyOn(client.attribution, 'track').mockImplementation(() => {});
    const trackCta = vi.spyOn(client.attribution, 'trackCta').mockImplementation(() => {});
    const flush = vi.spyOn(client.attribution, 'flush').mockResolvedValue(undefined);
    const { result, rerender } = renderHook(() => useAttribution(), { wrapper: createWrapper(client) });
    const first = result.current;

    result.current.track('demo_booked', { label: 'hero', value: 2 });
    result.current.trackCta('pricing');
    await result.current.flush();
    rerender();

    expect(track).toHaveBeenCalledWith('demo_booked', { label: 'hero', value: 2 });
    expect(trackCta).toHaveBeenCalledWith('pricing');
    expect(flush).toHaveBeenCalledTimes(1);
    expect(result.current.track).toBe(first.track);
    expect(result.current.trackCta).toBe(first.trackCta);
    expect(result.current.flush).toBe(first.flush);
  });
});

describe('WildwoodProvider campaign attribution', () => {
  it('starts attribution capture when it mounts', () => {
    const initialize = vi
      .spyOn(AttributionService.prototype, 'initialize')
      .mockResolvedValue(createTestClient().attribution.getState());
    try {
      render(
        <WildwoodProvider config={{ baseUrl: 'https://test.example.com', appId: 'test-app-id', storage: 'memory' }}>
          <div />
        </WildwoodProvider>,
      );

      expect(initialize).toHaveBeenCalled();
    } finally {
      initialize.mockRestore();
    }
  });
});
