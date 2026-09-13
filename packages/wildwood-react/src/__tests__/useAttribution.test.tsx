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
