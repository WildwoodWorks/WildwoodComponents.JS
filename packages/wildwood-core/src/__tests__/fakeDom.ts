// A minimal browser surface for the attribution funnel tests (core has no jsdom): window/document as
// real EventTargets, a history that moves location, viewport/scroll numbers, navigator.sendBeacon and a
// Map-backed sessionStorage. Installed with vi.stubGlobal, so vi.unstubAllGlobals() removes it.

import { vi } from 'vitest';

export interface FakeElement {
  attrs: Record<string, string>;
  parentElement: FakeElement | null;
  getAttribute(name: string): string | null;
  closest(selector: string): FakeElement | null;
}

export function fakeElement(attrs: Record<string, string> = {}, parent: FakeElement | null = null): FakeElement {
  const el: FakeElement = {
    attrs,
    parentElement: parent,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    closest(selector) {
      const match = /^\[([a-z-]+)\]$/.exec(selector);
      if (match && match[1] in attrs) return el;
      return parent ? parent.closest(selector) : null;
    },
  };
  return el;
}

export interface FakeDomOptions {
  href?: string;
  referrer?: string;
  width?: number;
  height?: number;
  scrollHeight?: number;
  coarse?: boolean;
  /** false removes sendBeacon; a function replaces it. */
  sendBeacon?: false | ((url: string, data: unknown) => boolean);
}

export function installFakeDom(options: FakeDomOptions = {}) {
  const location = { href: options.href ?? 'https://cairnfed.ai/' };
  const pushState = vi.fn((_state: unknown, _title: string, url?: string | URL | null) => {
    if (url != null) location.href = new URL(String(url), location.href).href;
  });
  const replaceState = vi.fn((_state: unknown, _title: string, url?: string | URL | null) => {
    if (url != null) location.href = new URL(String(url), location.href).href;
  });
  const history = { pushState, replaceState };
  const originalPushState = history.pushState;

  const win = Object.assign(new EventTarget(), {
    location,
    history,
    innerWidth: options.width ?? 1440,
    innerHeight: options.height ?? 1000,
    scrollY: 0,
    matchMedia: (query: string) => ({ matches: options.coarse === true && query.includes('coarse') }),
  });
  const root = { scrollHeight: options.scrollHeight ?? 4000, scrollTop: 0 };
  const doc = Object.assign(new EventTarget(), {
    referrer: options.referrer ?? '',
    visibilityState: 'visible' as 'visible' | 'hidden',
    documentElement: root,
    body: { scrollHeight: options.scrollHeight ?? 4000 },
  });

  const sendBeacon = vi.fn(
    typeof options.sendBeacon === 'function' ? options.sendBeacon : (_url: string, _data: unknown) => true,
  );
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('navigator', options.sendBeacon === false ? {} : { sendBeacon });

  return {
    window: win,
    document: doc,
    history,
    originalPushState,
    sendBeacon,
    /** Scrolls so that the viewport bottom sits at `percent` of the page and fires scroll. */
    scrollToPercent(percent: number) {
      win.scrollY = (percent / 100) * root.scrollHeight - win.innerHeight;
      win.dispatchEvent(new Event('scroll'));
    },
    setVisibility(state: 'visible' | 'hidden') {
      doc.visibilityState = state;
      doc.dispatchEvent(new Event('visibilitychange'));
    },
    pagehide() {
      win.dispatchEvent(new Event('pagehide'));
    },
    /** Moves location without history (a back/forward) and fires popstate. */
    popTo(url: string) {
      location.href = new URL(url, location.href).href;
      win.dispatchEvent(new Event('popstate'));
    },
    click(target: unknown) {
      const event = new Event('click');
      Object.defineProperty(event, 'target', { value: target });
      doc.dispatchEvent(event);
    },
    key() {
      doc.dispatchEvent(new Event('keydown'));
    },
  };
}

export type FakeDom = ReturnType<typeof installFakeDom>;

export function installSessionStorage(options: { throws?: boolean } = {}) {
  const data = new Map<string, string>();
  const fail = () => {
    throw new Error('SecurityError');
  };
  const store = {
    getItem: (key: string) => (options.throws ? fail() : (data.get(key) ?? null)),
    setItem: (key: string, value: string) => (options.throws ? fail() : void data.set(key, value)),
    removeItem: (key: string) => (options.throws ? fail() : void data.delete(key)),
  };
  vi.stubGlobal('sessionStorage', store);
  return { data, store };
}
