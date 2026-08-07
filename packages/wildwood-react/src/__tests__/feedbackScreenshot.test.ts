/**
 * Coverage for the feedback widget's screenshot capture.
 *
 * The reported defect these tests exist to pin: "Capture Area" failed with "Failed to capture
 * screenshot." on any host serving `script-src 'self'`, because it hard-depended on html2canvas
 * fetched from a public CDN, while "Full Page" kept working through the browser's own Screen
 * Capture API. Everything below is written so that reintroducing that dependency turns a test red.
 *
 * jsdom implements neither canvas rendering nor media capture, so the harness stubs: a 2d context
 * that RECORDS its drawImage arguments (the crop math is the thing worth asserting, and those
 * arguments are it), a <video> that reaches `loadedmetadata`, `navigator.mediaDevices`, the
 * viewport geometry, and `document.head.appendChild` for <script> — which is how a CSP refusal is
 * simulated, since a refused script fires `error` exactly as an unreachable one does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ensureHtml2Canvas, captureArea, ScreenshotCaptureError } from '../components/feedback/feedbackScreenshot.js';

type Html2CanvasLike = (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;

/**
 * The bundled dependency the module now imports dynamically. Held behind a getter so a test can
 * decide whether it resolves at all: `null` models a consumer with no bundler to resolve the
 * specifier (the loader then falls through to the <script> paths), a function models the normal
 * case. Mocking it also keeps the real html2canvas — which cannot render in jsdom — out of the
 * suite entirely.
 */
const bundled = vi.hoisted(() => ({ fn: null as Html2CanvasLike | null, reads: 0 }));
vi.mock('html2canvas', () => ({
  get default() {
    // Counted, because "how many times was the bundled copy consulted?" is what distinguishes
    // the capture path serving itself from `ensureHtml2Canvas` rescuing it after the fact.
    // The source reads this exactly once per resolution attempt.
    bundled.reads += 1;
    return bundled.fn ?? undefined;
  },
}));

const JPEG_URL = 'data:image/jpeg;base64,AAAA';

type DrawCall = unknown[];

/** Canvas 2d stub. `draws` records every drawImage; a 9-argument call is a crop. */
function installCanvasStub(): { draws: DrawCall[] } {
  const draws: DrawCall[] = [];
  const ctx = {
    drawImage: (...args: unknown[]) => {
      draws.push(args);
    },
    clearRect: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    closePath: () => undefined,
    stroke: () => undefined,
    fill: () => undefined,
    fillText: () => undefined,
    ellipse: () => undefined,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    font: '',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(JPEG_URL);
  return { draws };
}

/**
 * Saved so the media stubs can be undone. `vi.restoreAllMocks()` does not reverse
 * `Object.defineProperty`, so without this the stubs would be silent state shared between tests.
 */
const ORIGINAL_MEDIA_DESCRIPTORS: Array<[object, string, PropertyDescriptor | undefined]> = [
  [HTMLMediaElement.prototype, 'srcObject', Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject')],
  [HTMLMediaElement.prototype, 'play', Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'play')],
  [HTMLVideoElement.prototype, 'videoWidth', Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'videoWidth')],
  [
    HTMLVideoElement.prototype,
    'videoHeight',
    Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'videoHeight'),
  ],
];

function restoreVideoStub(): void {
  for (const [target, key, descriptor] of ORIGINAL_MEDIA_DESCRIPTORS) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else delete (target as Record<string, unknown>)[key];
  }
}

/** A <video> that reaches `loadedmetadata` and reports the given frame size. */
function installVideoStub(frameWidth: number, frameHeight: number): void {
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    configurable: true,
    get: () => null,
    set(this: HTMLVideoElement) {
      setTimeout(() => {
        const handler = this.onloadedmetadata;
        if (handler) handler.call(this, new Event('loadedmetadata'));
      }, 0);
    },
  });
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => frameWidth });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => frameHeight });
}

function installDisplayMedia(displaySurface?: string) {
  const stop = vi.fn();
  const track = { stop, getSettings: () => (displaySurface ? { displaySurface } : {}) };
  const getDisplayMedia = vi.fn().mockResolvedValue({ getVideoTracks: () => [track] } as unknown as MediaStream);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia } });
  return { getDisplayMedia, stop };
}

function removeDisplayMedia(): void {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
}

/** Simulate a CSP that refuses the CDN: every injected <script> fires `error`, as the browser does. */
function blockScriptLoads(): { injected: () => number } {
  let count = 0;
  const real = Node.prototype.appendChild;
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    if ((node as unknown as HTMLElement).tagName === 'SCRIPT') {
      count += 1;
      setTimeout(() => {
        const handler = (node as unknown as HTMLScriptElement).onerror;
        if (typeof handler === 'function') handler.call(node as unknown as HTMLScriptElement, new Event('error'));
      }, 0);
      return node;
    }
    return real.call(document.head, node) as T;
  });
  return { injected: () => count };
}

function setViewport(width: number, height: number, scrollX = 0, scrollY = 0): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  Object.defineProperty(window, 'scrollX', { configurable: true, value: scrollX });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: scrollY });
}

/** Poll (real timers) until the selector appears, so tests do not depend on internal timings. */
async function waitForElement(selector: string, timeoutMs = 3000): Promise<HTMLElement> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${selector}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

function mouse(el: HTMLElement, type: string, x: number, y: number): void {
  el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
}

/** Drag a rectangle on the selection overlay, then skip past the annotation editor. */
async function dragAndSkip(from: [number, number], to: [number, number]): Promise<void> {
  const overlay = await waitForElement('.ww-feedback-capture-overlay');
  mouse(overlay, 'mousedown', from[0], from[1]);
  mouse(overlay, 'mousemove', to[0], to[1]);
  mouse(overlay, 'mouseup', to[0], to[1]);
  const skip = await waitForElement('.ann-cancel-btn');
  skip.click();
}

/** The source rectangle of the crop: the only 9-argument drawImage in a capture. */
function cropArgs(draws: DrawCall[]): number[] {
  return cropCall(draws).slice(1, 5) as number[];
}

/** The whole crop call, so the destination rectangle can be pinned too. */
function cropCall(draws: DrawCall[]): DrawCall {
  const call = draws.find((d) => d.length === 9);
  if (!call) throw new Error('no crop drawImage was recorded');
  return call;
}

/** Delay a script load past LIBRARY_GRACE_MS (750ms) without ever failing it. */
const PAST_GRACE_MS = 900;

/** Resolve html2canvas onto the global, but only after `delayMs`. */
function installSlowScriptLoad(delayMs: number, fn: unknown): void {
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    if ((node as unknown as HTMLElement).tagName === 'SCRIPT') {
      setTimeout(() => {
        (globalThis as { html2canvas?: unknown }).html2canvas = fn;
        const handler = (node as unknown as HTMLScriptElement).onload;
        if (typeof handler === 'function') handler.call(node as unknown as HTMLScriptElement, new Event('load'));
      }, delayMs);
    }
    return node;
  });
}

beforeEach(() => {
  setViewport(1024, 768);
  delete (globalThis as { html2canvas?: unknown }).html2canvas;
  // Default to "no bundled copy resolvable", so every scenario written before the dependency
  // existed still exercises the path it was written for. Tests about the bundled path opt in.
  bundled.fn = null;
  bundled.reads = 0;
  delete (globalThis as { __WW_HTML2CANVAS_SRC__?: string }).__WW_HTML2CANVAS_SRC__;
  document.body.innerHTML = '';
});

afterEach(() => {
  // Unconditional, NOT in a `finally` inside whichever test enabled them: a test that times out
  // never reaches its own cleanup, and leaked fake timers turn one diagnosable failure into a
  // cascade of identical timeouts in every test after it.
  vi.useRealTimers();
  vi.restoreAllMocks();
  restoreVideoStub();
  removeDisplayMedia();
  delete (globalThis as { html2canvas?: unknown }).html2canvas;
});

describe('ensureHtml2Canvas', () => {
  it('resolves the BUNDLED copy, injecting no script and never reaching the CDN', async () => {
    // The point of shipping html2canvas as a dependency: a bundler resolves this from the app's
    // own origin, which `script-src 'self'` allows. If this ever regresses to a <script> tag the
    // widget is back to being broken behind a CSP, which is the whole reported defect.
    const fn = vi.fn() as unknown as Html2CanvasLike;
    bundled.fn = fn;
    const script = blockScriptLoads();

    await expect(ensureHtml2Canvas()).resolves.toBe(fn);
    expect(script.injected()).toBe(0);
  });

  it('lets a host that named its own URL keep control of where the library comes from', async () => {
    // __WW_HTML2CANVAS_SRC__ exists so a host can serve its own copy. Silently preferring the
    // bundled one would ignore a deliberate instruction.
    bundled.fn = vi.fn() as unknown as Html2CanvasLike;
    (globalThis as { __WW_HTML2CANVAS_SRC__?: string }).__WW_HTML2CANVAS_SRC__ = '/vendor/html2canvas.min.js';
    const script = blockScriptLoads();

    await expect(ensureHtml2Canvas()).rejects.toBeInstanceOf(ScreenshotCaptureError);
    expect(script.injected()).toBe(1);
  });

  it('uses a host-registered global without injecting anything', async () => {
    const fn = vi.fn();
    (globalThis as { html2canvas?: unknown }).html2canvas = fn;
    const script = blockScriptLoads();
    await expect(ensureHtml2Canvas()).resolves.toBe(fn);
    expect(script.injected()).toBe(0);
  });

  it('reports a refused load as library-blocked, and does NOT latch that failure', async () => {
    const script = blockScriptLoads();

    const first = await ensureHtml2Canvas().catch((e: unknown) => e);
    expect(first).toBeInstanceOf(ScreenshotCaptureError);
    expect((first as ScreenshotCaptureError).reason).toBe('library-blocked');
    expect(script.injected()).toBe(1);

    // The point of the test: a second attempt must try AGAIN rather than replay the cached
    // rejection. Before the fix, one blocked fetch disabled capture for the life of the page —
    // so a host that self-hosts the library and sets __WW_HTML2CANVAS_SRC__ after the first
    // failure, or a browser that simply came back online, stayed broken until a reload.
    await expect(ensureHtml2Canvas()).rejects.toBeInstanceOf(ScreenshotCaptureError);
    expect(script.injected()).toBe(2);
  });

  it('gives up on a request that never settles, instead of hanging forever', async () => {
    // A proxy that blackholes the request fires neither `load` nor `error`. The widget hides
    // itself for the duration of a capture, so an unsettled promise leaves it invisible with no
    // way back but a page reload.
    vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => node);
    vi.useFakeTimers(); // afterEach restores real timers, including when this test times out.
    const pending = ensureHtml2Canvas();
    const settled = vi.fn();
    pending.then(settled, settled);

    await vi.advanceTimersByTimeAsync(7_000);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    const err = await pending.catch((e: unknown) => e);
    expect((err as ScreenshotCaptureError).reason).toBe('library-timeout');
  });
});

describe('captureArea', () => {
  it('still captures, by cropping a native frame — the reported bug', async () => {
    const { draws } = installCanvasStub();
    installVideoStub(2048, 1536); // 1024x768 viewport at devicePixelRatio 2
    const { getDisplayMedia, stop } = installDisplayMedia('browser');
    blockScriptLoads();

    const capture = captureArea();
    await dragAndSkip([100, 50], [300, 250]);

    await expect(capture).resolves.toBe(JPEG_URL);
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    // Asking for this tab specifically is what makes the frame croppable to viewport coordinates.
    expect(getDisplayMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: { displaySurface: 'browser' }, preferCurrentTab: true }),
    );
    // 100,50 200x200 in CSS pixels, at the scale derived from the frame itself, drawn at the
    // origin of a canvas exactly that size.
    expect(cropCall(draws).slice(1)).toEqual([200, 100, 400, 400, 0, 0, 400, 400]);
    expect(cropArgs(draws)).toEqual([200, 100, 400, 400]);
    // The share must not outlive the capture — the browser keeps signalling it otherwise.
    expect(stop).toHaveBeenCalled();
  });

  it('prefers html2canvas when it IS available, and never asks to share the screen', async () => {
    installCanvasStub();
    const { getDisplayMedia } = installDisplayMedia('browser');
    const html2canvas = vi.fn().mockResolvedValue(document.createElement('canvas'));
    (globalThis as { html2canvas?: unknown }).html2canvas = html2canvas;

    // Scrolled, so the assertion below can actually SEE the offset being added. With the page at
    // 0,0 this test passed whether or not the source added it at all.
    setViewport(1024, 768, 30, 40);
    const capture = captureArea();
    await dragAndSkip([10, 20], [110, 140]);

    await expect(capture).resolves.toBe(JPEG_URL);
    expect(getDisplayMedia).not.toHaveBeenCalled();
    // html2canvas renders the whole DOCUMENT, so it takes the scroll offset that the native path
    // — which captures the viewport alone — must not.
    expect(html2canvas).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({ x: 40, y: 60, width: 100, height: 120 }),
    );
  });

  it('shifts the crop by whatever the page scrolled between the frame and the selection', async () => {
    const { draws } = installCanvasStub();
    installVideoStub(2048, 1536);
    installDisplayMedia('browser');
    blockScriptLoads();

    const capture = captureArea();
    await waitForElement('.ww-feedback-capture-overlay');
    // The frame is taken before the user selects, and nothing stops them scrolling in between:
    // the overlay is position:fixed and blocks touch panning only.
    setViewport(1024, 768, 0, 100);
    await dragAndSkip([0, 50], [200, 250]);

    await expect(capture).resolves.toBe(JPEG_URL);
    // Selected at viewport y=50 having scrolled 100px, so the content sits at frame y=150 (x2).
    expect(cropArgs(draws)).toEqual([0, 300, 400, 400]);
  });

  it('refuses a selection the frame never held rather than cropping the wrong place', async () => {
    const { draws } = installCanvasStub();
    // Chrome's "sharing this tab" infobar shrinks the viewport while the capture runs, so the
    // frame covers only the top 716 of the 768 CSS pixels the user later selects in.
    setViewport(1024, 716);
    installVideoStub(2048, 1432);
    installDisplayMedia('browser');
    blockScriptLoads();

    const capture = captureArea();
    await waitForElement('.ww-feedback-capture-overlay');
    setViewport(1024, 768);
    const overlay = document.querySelector<HTMLElement>('.ww-feedback-capture-overlay')!;
    mouse(overlay, 'mousedown', 100, 700);
    mouse(overlay, 'mouseup', 300, 760);

    const err = await capture.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ScreenshotCaptureError);
    expect((err as ScreenshotCaptureError).reason).toBe('failed');
    expect(draws.filter((d) => d.length === 9)).toHaveLength(0);
  });

  it('refuses a shared screen before the user wastes a drag on it', async () => {
    installCanvasStub();
    installVideoStub(2560, 1440);
    installDisplayMedia('monitor');
    blockScriptLoads();

    const err = await captureArea().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ScreenshotCaptureError);
    expect((err as ScreenshotCaptureError).reason).toBe('wrong-surface');
    // The refusal must land BEFORE the selection overlay, not after a careful selection.
    expect(document.querySelector('.ww-feedback-capture-overlay')).toBeNull();
  });

  it('catches a shared screen by its shape where the browser will not name the surface', async () => {
    // Safari and Firefox do not report `displaySurface`, so the aspect-ratio comparison is the
    // only thing standing between the user and a confidently cropped picture of the wrong place.
    installCanvasStub();
    installVideoStub(2560, 1440); // a 16:9 monitor, not the 4:3 viewport
    installDisplayMedia(undefined);
    blockScriptLoads();

    const capture = captureArea();
    // Not dragAndSkip: the refusal happens at crop time, so the annotation editor never opens.
    const overlay = await waitForElement('.ww-feedback-capture-overlay');
    mouse(overlay, 'mousedown', 100, 50);
    mouse(overlay, 'mouseup', 300, 250);

    const err = await capture.catch((e: unknown) => e);
    expect((err as ScreenshotCaptureError).reason).toBe('wrong-surface');
    expect(document.querySelector('.ww-feedback-annotation-overlay')).toBeNull();
  });

  it('does not wait out a slow library when it can capture natively instead', async () => {
    // The grace period exists so a library that merely HANGS cannot spend the click's transient
    // user activation, which getDisplayMedia needs and which the browser stamps at mousedown.
    // This pins it from the side the late-library test below cannot: a library still in flight
    // must not delay the native path.
    const { draws } = installCanvasStub();
    installVideoStub(2048, 1536);
    const { getDisplayMedia } = installDisplayMedia('browser');
    installSlowScriptLoad(PAST_GRACE_MS, vi.fn());

    const capture = captureArea();
    await dragAndSkip([100, 50], [300, 250]);

    await expect(capture).resolves.toBe(JPEG_URL);
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(cropArgs(draws)).toEqual([200, 100, 400, 400]);
  });

  it('falls back to a late library rather than abandoning it (no getDisplayMedia at all)', async () => {
    // iOS Safari has no getDisplayMedia, so the library is the only path there ever was.
    // Abandoning it because the grace period expired would reject a capture that can still
    // succeed — which is what a first, cold CDN fetch on a mobile connection looks like.
    installCanvasStub();
    removeDisplayMedia();
    const html2canvas = vi.fn().mockResolvedValue(document.createElement('canvas'));
    installSlowScriptLoad(PAST_GRACE_MS, html2canvas);

    const capture = captureArea();
    await dragAndSkip([5, 5], [105, 105]);

    await expect(capture).resolves.toBe(JPEG_URL);
    expect(html2canvas).toHaveBeenCalledTimes(1);
  });

  it('NEVER asks to share the screen when the bundled library is available', async () => {
    // The regression this run exists to prevent. On a CSP host the CDN is refused, and before
    // the library was bundled that left getDisplayMedia as the only route — so every capture
    // raised a share prompt, and dismissing it produced nothing at all. With a local copy the
    // prompt must not appear under any circumstance.
    //
    // Two assertions, pinning two different things:
    //   · getDisplayMedia is never called — kills any reordering that reaches for the native
    //     capture before consulting html2canvas.
    //   · the bundled copy is consulted EXACTLY ONCE — kills removal of captureArea's local
    //     fast path. Without that assertion the test is not load-bearing for the fast path at
    //     all: `ensureHtml2Canvas` retries the bundled import itself, so deleting the fast path
    //     merely resolves the library one layer down and the prompt still never appears. A
    //     second read is that rescue happening.
    // Neither assertion pins the grace-period TIMING, since a mocked import resolves instantly.
    // What the ordering actually buys is a slow local chunk not being abandoned for a prompt,
    // and that is timing only the browser test in e2e/ can control.
    const { draws } = installCanvasStub();
    const { getDisplayMedia } = installDisplayMedia('browser');
    blockScriptLoads(); // the CDN is refused, exactly as under `script-src 'self'`
    const html2canvas = vi.fn().mockResolvedValue(document.createElement('canvas'));
    bundled.fn = html2canvas as unknown as Html2CanvasLike;

    const capture = captureArea();
    await dragAndSkip([100, 50], [300, 250]);

    await expect(capture).resolves.toBe(JPEG_URL);
    expect(getDisplayMedia).not.toHaveBeenCalled();
    expect(html2canvas).toHaveBeenCalledTimes(1);
    expect(bundled.reads).toBe(1);
    // Rendered by the library, so nothing was cropped out of a captured video frame.
    expect(draws.filter((d) => d.length === 9)).toHaveLength(0);
  });

  // A bundled chunk that STALLS (rather than resolving or failing) is covered by the browser
  // test in e2e/, where the server can simply never answer the chunk request. Simulating it here
  // needs vi.resetModules + doMock gymnastics that end up loading the real html2canvas anyway —
  // a fragile test is worse than a test in the right place.

  it('treats Escape as a cancel, not a failure', async () => {
    installCanvasStub();
    installVideoStub(2048, 1536);
    installDisplayMedia('browser');
    blockScriptLoads();

    const capture = captureArea();
    await waitForElement('.ww-feedback-capture-overlay');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    await expect(capture).resolves.toBeNull();
    expect(document.querySelector('.ww-feedback-capture-overlay')).toBeNull();
  });
});
