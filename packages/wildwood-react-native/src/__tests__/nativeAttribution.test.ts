import { describe, it, expect, vi } from 'vitest';
import {
  nativeAttributionOptions,
  nativeDeviceClass,
  subscribeAttributionFlush,
  type AppStateSource,
  type DimensionsSource,
} from '../provider/nativeAttribution';
import { trackScreenView } from '../hooks/useAttributionScreen';

const dims = (width: number, height: number): DimensionsSource => ({ get: () => ({ width, height }) });

describe('nativeDeviceClass', () => {
  it('is a tablet from a 600-point shortest side, in either orientation', () => {
    expect(nativeDeviceClass(dims(375, 812))).toBe('mobile');
    expect(nativeDeviceClass(dims(812, 375))).toBe('mobile');
    expect(nativeDeviceClass(dims(599, 1000))).toBe('mobile');
    expect(nativeDeviceClass(dims(600, 960))).toBe('tablet');
    expect(nativeDeviceClass(dims(1366, 1024))).toBe('tablet');
  });

  it('reports a phone when the dimensions cannot be read', () => {
    expect(
      nativeDeviceClass({
        get: () => {
          throw new Error('no window');
        },
      }),
    ).toBe('mobile');
    expect(nativeDeviceClass(dims(Number.NaN, Number.NaN))).toBe('mobile');
  });
});

describe('subscribeAttributionFlush', () => {
  function appState() {
    let listener: ((state: string) => void) | null = null;
    const remove = vi.fn(() => {
      listener = null;
    });
    const source: AppStateSource = {
      addEventListener: vi.fn((_type, handler) => {
        listener = handler;
        return { remove };
      }),
    };
    return { source, remove, emit: (state: string) => listener?.(state) };
  }

  it('flushes when the app goes to the background or inactive, not when it comes back', () => {
    const state = appState();
    const attribution = { flush: vi.fn(async () => {}) };
    subscribeAttributionFlush(state.source, attribution);

    state.emit('active');
    expect(attribution.flush).not.toHaveBeenCalled();
    state.emit('inactive');
    state.emit('background');
    expect(attribution.flush).toHaveBeenCalledTimes(2);
    expect(state.source.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('unsubscribes, and never throws from a failing flush or a missing AppState', async () => {
    const state = appState();
    const attribution = {
      flush: vi.fn(() => {
        throw new Error('boom');
      }),
    };
    const unsubscribe = subscribeAttributionFlush(state.source, attribution as never);
    expect(() => state.emit('background')).not.toThrow();
    unsubscribe();
    expect(state.remove).toHaveBeenCalledTimes(1);

    const broken: AppStateSource = {
      addEventListener: () => {
        throw new Error('no AppState');
      },
    };
    expect(() => subscribeAttributionFlush(broken, { flush: async () => {} })()).not.toThrow();

    const rejecting = appState();
    subscribeAttributionFlush(rejecting.source, { flush: () => Promise.reject(new Error('offline')) });
    rejecting.emit('background');
    await Promise.resolve();
  });
});

describe('trackScreenView', () => {
  it('tracks a page_view carrying the screen as its path', () => {
    const attribution = { track: vi.fn() };
    trackScreenView(attribution, ' Pricing ');
    expect(attribution.track).toHaveBeenCalledWith('page_view', { path: 'Pricing' });
  });

  it('ignores an empty name, a missing service and a throwing one', () => {
    const attribution = {
      track: vi.fn(() => {
        throw new Error('boom');
      }),
    };
    trackScreenView(attribution, '   ');
    expect(attribution.track).not.toHaveBeenCalled();
    expect(() => trackScreenView(attribution, 'Home')).not.toThrow();
    expect(() => trackScreenView(null, 'Home')).not.toThrow();
  });
});

describe('nativeAttributionOptions', () => {
  it('supplies the native platform and a screen device class under the host options', () => {
    const options = nativeAttributionOptions(undefined, 'ios', dims(820, 1180));
    expect(options.platform).toBe('ios');
    expect(options.getDeviceClass?.()).toBe('tablet');
  });

  it("keeps the host's own platform, device class and other settings", () => {
    const own = () => 'desktop' as const;
    const options = nativeAttributionOptions(
      { platform: 'android', getDeviceClass: own, defaultWindowDays: 14 },
      'ios',
      dims(375, 812),
    );
    expect(options.platform).toBe('android');
    expect(options.getDeviceClass).toBe(own);
    expect(options.defaultWindowDays).toBe(14);
  });
});
