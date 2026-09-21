/**
 * The consent banner is `position: fixed; bottom: 0; z-index: 9000`, so anything the host app
 * anchors to the bottom of the viewport sits underneath it. It was found covering the send button
 * of a host's AI assistant: the button was visible and enabled, and clicking it did nothing,
 * because the banner was taking the pointer events.
 *
 * The host cannot leave room for it on its own — the height depends on the configured copy and on
 * how that copy wraps — so the banner measures itself, publishes `--ww-consent-height`, and by
 * default adds its height to the page's bottom padding. All of it is undone when the banner goes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';

const BANNER_HEIGHT = 84;

const consent = {
  config: {
    enabled: true,
    categories: ['Analytics'],
    bannerText: {},
  },
  state: { categories: {} },
  shouldShowBanner: true,
  initialize: vi.fn().mockResolvedValue(undefined),
  acceptAll: vi.fn().mockResolvedValue(undefined),
  rejectAll: vi.fn().mockResolvedValue(undefined),
  setCategories: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../hooks/useConsent.js', () => ({
  useConsent: () => consent,
}));

const { ConsentBanner } = await import('../components/consent/ConsentBanner.js');

let originalOffsetHeight: PropertyDescriptor | undefined;

beforeEach(() => {
  // jsdom lays nothing out, so every element measures 0. Give the banner a height, or the test
  // would "pass" by reserving nothing at all.
  originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return (this as HTMLElement).classList?.contains('ww-consent-banner') ? BANNER_HEIGHT : 0;
    },
  });
});

afterEach(() => {
  cleanup();
  if (originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
  }
  document.body.style.paddingBottom = '';
  document.documentElement.style.removeProperty('--ww-consent-height');
});

describe('ConsentBanner space reservation', () => {
  it('reserves its own height so it cannot cover the page, and gives it all back', async () => {
    const view = render(<ConsentBanner />);

    await waitFor(() => {
      expect(document.body.style.paddingBottom).toBe(`${BANNER_HEIGHT}px`);
    });
    expect(document.documentElement.style.getPropertyValue('--ww-consent-height')).toBe(`${BANNER_HEIGHT}px`);

    view.unmount();

    // Restored, not merely zeroed: a host that had its own inline padding must get it back.
    expect(document.body.style.paddingBottom).toBe('');
    expect(document.documentElement.style.getPropertyValue('--ww-consent-height')).toBe('');
  });

  it('adds to the page’s own bottom padding instead of replacing it', async () => {
    document.body.style.paddingBottom = '20px';

    const view = render(<ConsentBanner />);

    await waitFor(() => {
      expect(document.body.style.paddingBottom).toBe(`${20 + BANNER_HEIGHT}px`);
    });

    view.unmount();
    expect(document.body.style.paddingBottom).toBe('20px');
  });

  it('still publishes the height when the host opts out of the padding', async () => {
    render(<ConsentBanner reserveSpace={false} />);

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--ww-consent-height')).toBe(`${BANNER_HEIGHT}px`);
    });
    // The host said it would place the room itself, so the banner must not touch the page.
    expect(document.body.style.paddingBottom).toBe('');
  });
});
