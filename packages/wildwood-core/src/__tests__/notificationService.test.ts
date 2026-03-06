import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationService } from '../notifications/notificationService.js';
import { NotificationType } from '../notifications/types.js';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new NotificationService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with an empty toast queue', () => {
    expect(service.getToasts()).toHaveLength(0);
  });

  describe('show()', () => {
    it('adds a toast to the queue', () => {
      service.show('Hello');
      const toasts = service.getToasts();
      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe('Hello');
      expect(toasts[0].type).toBe(NotificationType.Info);
    });

    it('returns a string id', () => {
      const id = service.show('Test');
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('assigns unique ids to each toast', () => {
      const id1 = service.show('A');
      const id2 = service.show('B');
      expect(id1).not.toBe(id2);
    });
  });

  describe('convenience methods', () => {
    it('info() creates an Info toast', () => {
      service.info('info msg');
      expect(service.getToasts()[0].type).toBe(NotificationType.Info);
    });

    it('success() creates a Success toast', () => {
      service.success('ok');
      expect(service.getToasts()[0].type).toBe(NotificationType.Success);
    });

    it('warning() creates a Warning toast', () => {
      service.warning('caution');
      expect(service.getToasts()[0].type).toBe(NotificationType.Warning);
    });

    it('error() creates an Error toast', () => {
      service.error('fail');
      expect(service.getToasts()[0].type).toBe(NotificationType.Error);
    });

    it('error() does not auto-dismiss (duration 0)', () => {
      service.error('persistent');
      const toast = service.getToasts()[0];
      expect(toast.duration).toBe(0);

      vi.advanceTimersByTime(60_000);
      expect(service.getToasts()).toHaveLength(1);
    });
  });

  describe('dismiss()', () => {
    it('removes a specific toast by id', () => {
      const id = service.show('to remove');
      service.show('to keep');
      expect(service.getToasts()).toHaveLength(2);

      service.dismiss(id);
      expect(service.getToasts()).toHaveLength(1);
      expect(service.getToasts()[0].message).toBe('to keep');
    });

    it('does nothing when id does not exist', () => {
      service.show('A');
      service.dismiss('nonexistent');
      expect(service.getToasts()).toHaveLength(1);
    });
  });

  describe('clear()', () => {
    it('removes all toasts', () => {
      service.show('A');
      service.show('B');
      service.show('C');
      expect(service.getToasts()).toHaveLength(3);

      service.clear();
      expect(service.getToasts()).toHaveLength(0);
    });
  });

  describe('auto-dismiss', () => {
    it('removes toast after default duration (5000ms)', () => {
      service.show('temp');
      expect(service.getToasts()).toHaveLength(1);

      vi.advanceTimersByTime(5000);
      expect(service.getToasts()).toHaveLength(0);
    });

    it('respects custom duration', () => {
      service.show('quick', NotificationType.Info, undefined, 1000);
      expect(service.getToasts()).toHaveLength(1);

      vi.advanceTimersByTime(999);
      expect(service.getToasts()).toHaveLength(1);

      vi.advanceTimersByTime(1);
      expect(service.getToasts()).toHaveLength(0);
    });

    it('does not auto-dismiss when duration is 0', () => {
      service.show('sticky', NotificationType.Info, undefined, 0);
      vi.advanceTimersByTime(60_000);
      expect(service.getToasts()).toHaveLength(1);
    });
  });

  describe('subscribe()', () => {
    it('notifies listeners when toasts change', () => {
      const listener = vi.fn();
      service.subscribe(listener);

      service.show('A');
      expect(listener).toHaveBeenCalledTimes(1);

      service.show('B');
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('returns an unsubscribe function', () => {
      const listener = vi.fn();
      const unsub = service.subscribe(listener);

      service.show('A');
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
      service.show('B');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies on dismiss', () => {
      const listener = vi.fn();
      const id = service.show('A');
      service.subscribe(listener);

      service.dismiss(id);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies on clear', () => {
      const listener = vi.fn();
      service.show('A');
      service.subscribe(listener);

      service.clear();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
