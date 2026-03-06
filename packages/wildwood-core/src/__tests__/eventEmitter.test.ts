import { describe, it, expect, vi } from 'vitest';
import { WildwoodEventEmitter } from '../events/eventEmitter.js';

describe('WildwoodEventEmitter', () => {
  it('delivers events to subscribed handlers', () => {
    const emitter = new WildwoodEventEmitter();
    const handler = vi.fn();

    emitter.on('tokenRefreshed', handler);
    emitter.emit('tokenRefreshed', 'new-token');

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('new-token');
  });

  it('returns an unsubscribe function from on()', () => {
    const emitter = new WildwoodEventEmitter();
    const handler = vi.fn();

    const unsub = emitter.on('tokenRefreshed', handler);
    unsub();
    emitter.emit('tokenRefreshed', 'token');

    expect(handler).not.toHaveBeenCalled();
  });

  it('supports multiple listeners on the same event', () => {
    const emitter = new WildwoodEventEmitter();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on('themeChanged', handler1);
    emitter.on('themeChanged', handler2);
    emitter.emit('themeChanged', 'dark');

    expect(handler1).toHaveBeenCalledWith('dark');
    expect(handler2).toHaveBeenCalledWith('dark');
  });

  it('handles void events (sessionExpired)', () => {
    const emitter = new WildwoodEventEmitter();
    const handler = vi.fn();

    emitter.on('sessionExpired', handler);
    emitter.emit('sessionExpired');

    expect(handler).toHaveBeenCalledOnce();
  });

  it('handles error events with structured data', () => {
    const emitter = new WildwoodEventEmitter();
    const handler = vi.fn();

    emitter.on('error', handler);
    const errorData = { service: 'auth', message: 'Token expired', details: { code: 401 } };
    emitter.emit('error', errorData);

    expect(handler).toHaveBeenCalledWith(errorData);
  });

  it('handles authChanged event with null', () => {
    const emitter = new WildwoodEventEmitter();
    const handler = vi.fn();

    emitter.on('authChanged', handler);
    emitter.emit('authChanged', null);

    expect(handler).toHaveBeenCalledWith(null);
  });

  it('off() removes a specific handler', () => {
    const emitter = new WildwoodEventEmitter();
    const handler = vi.fn();

    emitter.on('tokenRefreshed', handler);
    emitter.off('tokenRefreshed', handler);
    emitter.emit('tokenRefreshed', 'token');

    expect(handler).not.toHaveBeenCalled();
  });

  it('removeAllListeners() clears listeners for a specific event', () => {
    const emitter = new WildwoodEventEmitter();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on('themeChanged', handler1);
    emitter.on('tokenRefreshed', handler2);
    emitter.removeAllListeners('themeChanged');

    emitter.emit('themeChanged', 'light');
    emitter.emit('tokenRefreshed', 'tok');

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledOnce();
  });

  it('removeAllListeners() with no args clears everything', () => {
    const emitter = new WildwoodEventEmitter();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on('themeChanged', handler1);
    emitter.on('tokenRefreshed', handler2);
    emitter.removeAllListeners();

    emitter.emit('themeChanged', 'light');
    emitter.emit('tokenRefreshed', 'tok');

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('does not throw when emitting with no listeners', () => {
    const emitter = new WildwoodEventEmitter();
    expect(() => emitter.emit('sessionExpired')).not.toThrow();
  });

  it('catches errors thrown by handlers without breaking other handlers', () => {
    const emitter = new WildwoodEventEmitter();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const badHandler = vi.fn(() => { throw new Error('boom'); });
    const goodHandler = vi.fn();

    emitter.on('tokenRefreshed', badHandler);
    emitter.on('tokenRefreshed', goodHandler);
    emitter.emit('tokenRefreshed', 'tok');

    expect(badHandler).toHaveBeenCalled();
    expect(goodHandler).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
