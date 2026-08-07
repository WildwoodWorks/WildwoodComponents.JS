// Screenshot capture + annotation for the FeedbackComponent.
// Originally ported from WildwoodAdmin/wwwroot/js/feedback-widget.js (ensureHtml2Canvas,
// compressScreenshot, captureArea, captureFullPage, openAnnotationEditor).
//
// html2canvas is a BUNDLED DEPENDENCY, loaded with a dynamic import the first time a user
// asks for a screenshot. That single fact is what makes capture work behind a strict
// Content-Security-Policy: a bundler emits the dynamic import as a chunk served from the
// application's OWN origin, which `script-src 'self'` permits, where the public CDN this
// module used to depend on is refused outright. Being dynamic, it also code-splits — an app
// that never opens the feedback widget never downloads it.
//
// Resolution order, most to least preferred:
//   1. `globalThis.html2canvas` pre-registered by the host — nothing is fetched.
//   2. `globalThis.__WW_HTML2CANVAS_SRC__` — a host serving its own copy from a URL it picks.
//   3. The bundled dependency (the normal path).
//   4. The CDN — last, and only useful to consumers who load this SDK from a CDN themselves
//      and so have no bundler to resolve step 3.
//
// The browser's own Screen Capture API (getDisplayMedia) remains available underneath all of
// this, but it is a LAST RESORT and not a peer: it puts a share-permission prompt in front of
// the user, which is a bad trade for something html2canvas does silently.
//
// The capture overlay and annotation editor are built directly on document.body
// (outside React) because they must sit above the page during selection/markup;
// their styles live in the global feedback CSS (ww-feedback-capture-* and
// ww-feedback-annotation-* rules).

const DEFAULT_HTML2CANVAS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

/**
 * How long to wait for the html2canvas <script> before giving up. A blocked request usually
 * fires `onerror` immediately; this deadline exists for the one that never fires at all.
 */
const HTML2CANVAS_LOAD_TIMEOUT_MS = 8000;

/** The host's chosen URL for the library, if it named one. Single source of truth for both uses. */
function srcOverride(): string | undefined {
  const override = (globalThis as { __WW_HTML2CANVAS_SRC__?: string }).__WW_HTML2CANVAS_SRC__;
  return typeof override === 'string' && override.length > 0 ? override : undefined;
}

/** Resolve where html2canvas is loaded from, honoring a host's self-hosted override. */
function html2canvasSrc(): string {
  return srcOverride() ?? DEFAULT_HTML2CANVAS_CDN;
}

type Html2CanvasFn = (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;

function getHtml2Canvas(): Html2CanvasFn | undefined {
  return (globalThis as unknown as { html2canvas?: Html2CanvasFn }).html2canvas;
}

/**
 * How long to wait for the bundled chunk before giving up on it.
 *
 * The import cannot be REFUSED by a Content-Security-Policy — that is the whole point of
 * bundling — but it is still a network fetch: a bundler code-splits it, so the first screenshot
 * downloads a chunk. A degraded connection, a stalling proxy, or a server hiccup can therefore
 * leave it neither resolved nor rejected, exactly the failure the `<script>` path already guards
 * against with {@link HTML2CANVAS_LOAD_TIMEOUT_MS}. Unbounded, that would either hang the capture
 * outright or silently spend the transient user activation the native fallback still needs.
 *
 * Generous against a same-origin chunk (tens of milliseconds in practice), small against the ~5s
 * activation window opened by the click.
 */
const BUNDLED_IMPORT_TIMEOUT_MS = 2000;

/**
 * The library, if it can be had without a THIRD-PARTY fetch: already registered by the host, or
 * the bundled dependency. Never rejects, and always settles — see
 * {@link BUNDLED_IMPORT_TIMEOUT_MS} for why "always settles" needs saying.
 *
 * The capture paths ask this before anything else, because an answer here costs no permission
 * prompt.
 */
async function loadLocalHtml2Canvas(): Promise<Html2CanvasFn | undefined> {
  const existing = getHtml2Canvas();
  if (existing) return existing;
  // A host that named its own URL wants that URL fetched; that is a network load, not this.
  if (srcOverride()) return undefined;
  return importBundledHtml2Canvas();
}

/**
 * Load the bundled copy. Returns undefined — never throws, never hangs — when the import cannot
 * be resolved or does not arrive in time, so the <script> paths below still get their turn.
 *
 * A consumer that loads this SDK straight from a CDN, with no bundler to resolve the
 * specifier, is the case that lands here: for them this is a dead end and the CDN fallback
 * is the real path. For everyone else this is the path, and nothing leaves the origin.
 */
async function importBundledHtml2Canvas(): Promise<Html2CanvasFn | undefined> {
  try {
    // A chunk that arrives after the deadline is not wasted: the module cache means the next
    // attempt gets it immediately.
    const mod = (await settledWithin(import('html2canvas'), BUNDLED_IMPORT_TIMEOUT_MS)) as {
      default?: Html2CanvasFn;
    } | null;
    return typeof mod?.default === 'function' ? mod.default : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Why a capture could not be produced. Callers render different copy per reason, so a
 * cause that the widget can explain must never collapse into a bare `Error`.
 *
 * - `library-blocked`  the html2canvas <script> was refused or failed to fetch. In practice
 *                      this is almost always a Content-Security-Policy that omits the CDN
 *                      host: a strict `script-src 'self'` blocks the default cdnjs URL.
 * - `library-timeout`  the request neither loaded nor errored inside the deadline (a proxy
 *                      that blackholes the request). Distinguished from `library-blocked`
 *                      because "your CSP refused it" would be a false accusation here.
 * - `permission`       the share picker was dismissed, or this document is not permitted to call
 *                      getDisplayMedia at all. The two are indistinguishable — both surface as
 *                      NotAllowedError — and the first is a deliberate cancel, so the widget
 *                      reports this reason as NOTHING rather than as an error. The cost of that
 *                      choice: a document blocked by permissions policy, on a host where the
 *                      library is also unavailable, leaves the button silent.
 * - `wrong-surface`    the user shared a screen or another window instead of this tab, so
 *                      viewport coordinates cannot be mapped onto the frame. See
 *                      {@link viewportScale}.
 * - `unsupported`      the capture path does not exist in this environment.
 * - `failed`           anything else.
 */
export type CaptureFailureReason =
  | 'library-blocked'
  | 'library-timeout'
  | 'permission'
  | 'wrong-surface'
  | 'unsupported'
  | 'failed';

export class ScreenshotCaptureError extends Error {
  readonly reason: CaptureFailureReason;

  constructor(reason: CaptureFailureReason, message: string) {
    super(message);
    this.name = 'ScreenshotCaptureError';
    this.reason = reason;
  }
}

/**
 * In-flight load only. A SETTLED promise is never kept:
 *  - resolved, and `globalThis.html2canvas` is set, so the fast path above returns it;
 *  - rejected, and caching it would make one blocked fetch permanent for the life of the
 *    page — a host that self-hosts the library and sets `__WW_HTML2CANVAS_SRC__`, or one
 *    that simply comes back online, would keep being told the library is unavailable until
 *    a reload. Every failure is therefore retryable on the next attempt.
 */
let loadPromise: Promise<Html2CanvasFn> | null = null;

/**
 * Lazily load html2canvas (once per in-flight attempt). Rejects with a
 * {@link ScreenshotCaptureError} naming the cause; a rejection does not disable later attempts.
 */
export function ensureHtml2Canvas(): Promise<Html2CanvasFn> {
  const existing = getHtml2Canvas();
  if (existing) return Promise.resolve(existing);
  if (loadPromise) return loadPromise;

  const attempt = (async (): Promise<Html2CanvasFn> => {
    if (typeof document === 'undefined') {
      throw new ScreenshotCaptureError('unsupported', 'Screenshot capture is only available in the browser');
    }

    // The bundled dependency, unless the host named its own URL. A host that sets
    // `__WW_HTML2CANVAS_SRC__` has said where it wants the library to come from, and honouring
    // that is the whole point of the setting, so the <script> path still wins there.
    if (!srcOverride()) {
      const bundled = await importBundledHtml2Canvas();
      if (bundled) return bundled;
    }

    return await new Promise<Html2CanvasFn>((resolve, reject) => {
      // Assigning script.src can THROW synchronously under `require-trusted-types-for 'script'`,
      // a policy that travels with the same strict CSPs that block the CDN in the first place.
      // Without this guard the executor would leak a bare TypeError past the typed contract.
      try {
        startLoad(resolve, reject);
      } catch (err) {
        reject(
          new ScreenshotCaptureError(
            'library-blocked',
            'Could not request the screenshot library from ' +
              html2canvasSrc() +
              (err instanceof Error ? ': ' + err.message : ''),
          ),
        );
      }
    });
  })();

  loadPromise = attempt;
  const clearIfCurrent = () => {
    if (loadPromise === attempt) loadPromise = null;
  };
  attempt.then(clearIfCurrent, clearIfCurrent);
  return attempt;
}

/** Inject the <script> and settle exactly once. Extracted so its synchronous throws are catchable. */
function startLoad(resolve: (fn: Html2CanvasFn) => void, reject: (err: unknown) => void): void {
  const script = document.createElement('script');
  // Assigned before the timer is armed, because this is the line that can throw synchronously
  // (a `require-trusted-types-for 'script'` policy). Arming first would leave a stray 8s timer
  // behind on that path, firing into an already-rejected promise.
  script.src = html2canvasSrc();
  // Settle exactly once and always: a script request that is blackholed by a proxy fires
  // NEITHER onload nor onerror, and an unsettled promise here strands the caller — the
  // widget hides itself for the duration of a capture, so it would stay invisible until
  // the page is reloaded.
  let settled = false;
  const finish = (fn: () => void) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    script.onload = null;
    script.onerror = null;
    fn();
  };
  const timer = setTimeout(() => {
    finish(() => {
      script.remove();
      reject(
        new ScreenshotCaptureError(
          'library-timeout',
          'Timed out loading the screenshot library (' + html2canvasSrc() + ')',
        ),
      );
    });
  }, HTML2CANVAS_LOAD_TIMEOUT_MS);

  script.onload = () =>
    finish(() => {
      const fn = getHtml2Canvas();
      if (fn) {
        resolve(fn);
        return;
      }
      // Nothing to reuse: drop the element so a retry is not competing with a dud.
      script.remove();
      reject(new ScreenshotCaptureError('library-blocked', 'The screenshot library loaded but did not initialize'));
    });
  // Fires for a network failure AND for a CSP refusal, which is the common case: a host
  // serving `script-src 'self'` blocks the default CDN URL outright.
  script.onerror = () =>
    finish(() => {
      script.remove();
      reject(
        new ScreenshotCaptureError('library-blocked', 'Could not load the screenshot library from ' + html2canvasSrc()),
      );
    });
  document.head.appendChild(script);
}

/** Compress a canvas to a size-bounded JPEG data URL (mirrors widget compressScreenshot). */
export function compressScreenshot(canvas: HTMLCanvasElement, qualityPct = 80, maxSizeKb = 500): string {
  const quality = qualityPct / 100;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  if (maxSizeKb > 0) {
    const maxBytes = maxSizeKb * 1024;
    let cq = quality;
    while (dataUrl.length * 0.75 > maxBytes && cq > 0.1) {
      cq -= 0.1;
      dataUrl = canvas.toDataURL('image/jpeg', cq);
    }
    if (dataUrl.length * 0.75 > maxBytes) {
      const sc = Math.sqrt(maxBytes / (dataUrl.length * 0.75));
      const scaled = document.createElement('canvas');
      scaled.width = Math.round(canvas.width * sc);
      scaled.height = Math.round(canvas.height * sc);
      scaled.getContext('2d')?.drawImage(canvas, 0, 0, scaled.width, scaled.height);
      dataUrl = scaled.toDataURL('image/jpeg', 0.7);
    }
  }
  return dataUrl;
}

// ===== Annotation drawing primitives =====

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const hl = 12;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - hl * Math.cos(angle - Math.PI / 6), y2 - hl * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - hl * Math.cos(angle + Math.PI / 6), y2 - hl * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawFreehand(ctx: CanvasRenderingContext2D, pts: Array<{ x: number; y: number }>, color: string): void {
  if (pts.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

interface Annotation {
  tool: 'arrow' | 'circle' | 'draw' | 'text';
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  x?: number;
  y?: number;
  text?: string;
  points?: Array<{ x: number; y: number }>;
  color: string;
}

/**
 * Lightweight annotation editor (arrow/circle/freehand/text, color picker, undo).
 * Resolves with a compressed JPEG data URL, or null if the user cancels (Escape).
 */
function openAnnotationEditor(
  sourceCanvas: HTMLCanvasElement,
  qualityPct: number,
  maxSizeKb: number,
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const editorOverlay = document.createElement('div');
    editorOverlay.className = 'ww-feedback-annotation-overlay';

    const toolbar = document.createElement('div');
    toolbar.className = 'ww-feedback-annotation-toolbar';

    const tools: Array<{ icon: string; label: string; tool: Annotation['tool'] }> = [
      { icon: '↗', label: 'Arrow', tool: 'arrow' },
      { icon: '◯', label: 'Circle', tool: 'circle' },
      { icon: '✎', label: 'Draw', tool: 'draw' },
      { icon: 'T', label: 'Text', tool: 'text' },
    ];
    let currentTool: Annotation['tool'] = 'arrow';
    let annotColor = '#FF0000';
    const annotations: Annotation[] = [];

    tools.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t.icon;
      b.title = t.label;
      b.className = 'ann-tool-btn' + (t.tool === currentTool ? ' active' : '');
      b.addEventListener('click', () => {
        currentTool = t.tool;
        toolbar.querySelectorAll('.ann-tool-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      });
      toolbar.appendChild(b);
    });

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = annotColor;
    colorInput.className = 'ann-color-picker';
    colorInput.title = 'Color';
    colorInput.addEventListener('input', () => {
      annotColor = colorInput.value;
    });
    toolbar.appendChild(colorInput);

    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.textContent = '↶';
    undoBtn.title = 'Undo';
    undoBtn.className = 'ann-tool-btn';
    undoBtn.addEventListener('click', () => {
      if (annotations.length) {
        annotations.pop();
        redraw();
      }
    });
    toolbar.appendChild(undoBtn);

    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    toolbar.appendChild(spacer);

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.textContent = 'Done';
    doneBtn.className = 'ann-done-btn';
    doneBtn.addEventListener('click', () => {
      const fc = document.createElement('canvas');
      fc.width = annCanvas.width;
      fc.height = annCanvas.height;
      const fctx = fc.getContext('2d');
      if (fctx) {
        fctx.drawImage(sourceCanvas, 0, 0, annCanvas.width, annCanvas.height);
        fctx.drawImage(annCanvas, 0, 0);
      }
      cleanup();
      resolve(compressScreenshot(fctx ? fc : sourceCanvas, qualityPct, maxSizeKb));
    });
    toolbar.appendChild(doneBtn);

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.textContent = 'Skip';
    skipBtn.className = 'ann-cancel-btn';
    skipBtn.addEventListener('click', () => {
      cleanup();
      resolve(compressScreenshot(sourceCanvas, qualityPct, maxSizeKb));
    });
    toolbar.appendChild(skipBtn);

    editorOverlay.appendChild(toolbar);

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'ww-feedback-annotation-canvas-wrap';
    const maxW = Math.min(window.innerWidth - 40, 900);
    const maxH = Math.min(window.innerHeight - 100, 600);
    const scale = Math.min(maxW / sourceCanvas.width, maxH / sourceCanvas.height, 1);
    const dispW = Math.round(sourceCanvas.width * scale);
    const dispH = Math.round(sourceCanvas.height * scale);

    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = dispW;
    bgCanvas.height = dispH;
    bgCanvas.className = 'ww-feedback-annotation-bg';
    bgCanvas.getContext('2d')?.drawImage(sourceCanvas, 0, 0, dispW, dispH);

    const annCanvas = document.createElement('canvas');
    annCanvas.width = dispW;
    annCanvas.height = dispH;
    annCanvas.className = 'ww-feedback-annotation-draw';
    const annCtx = annCanvas.getContext('2d');

    canvasWrap.appendChild(bgCanvas);
    canvasWrap.appendChild(annCanvas);
    editorOverlay.appendChild(canvasWrap);
    document.body.appendChild(editorOverlay);

    let drawing = false;
    let sx = 0;
    let sy = 0;
    let freehandPts: Array<{ x: number; y: number }> = [];

    annCanvas.addEventListener('mousedown', (e) => {
      const r = annCanvas.getBoundingClientRect();
      sx = e.clientX - r.left;
      sy = e.clientY - r.top;
      drawing = true;
      if (currentTool === 'draw') freehandPts = [{ x: sx, y: sy }];
      if (currentTool === 'text') {
        drawing = false;
        const txt = prompt('Enter text:');
        if (txt) {
          annotations.push({ tool: 'text', x: sx, y: sy, text: txt, color: annotColor });
          redraw();
        }
      }
    });
    annCanvas.addEventListener('mousemove', (e) => {
      if (!drawing || !annCtx) return;
      const r = annCanvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      if (currentTool === 'draw') freehandPts.push({ x: mx, y: my });
      redraw();
      if (currentTool === 'arrow') drawArrow(annCtx, sx, sy, mx, my, annotColor);
      else if (currentTool === 'circle') {
        annCtx.strokeStyle = annotColor;
        annCtx.lineWidth = 2;
        annCtx.beginPath();
        annCtx.ellipse((sx + mx) / 2, (sy + my) / 2, Math.abs(mx - sx) / 2, Math.abs(my - sy) / 2, 0, 0, Math.PI * 2);
        annCtx.stroke();
      } else if (currentTool === 'draw') drawFreehand(annCtx, freehandPts, annotColor);
    });
    annCanvas.addEventListener('mouseup', (e) => {
      if (!drawing) return;
      drawing = false;
      const r = annCanvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      if (currentTool === 'arrow')
        annotations.push({ tool: 'arrow', x1: sx, y1: sy, x2: mx, y2: my, color: annotColor });
      else if (currentTool === 'circle')
        annotations.push({ tool: 'circle', x1: sx, y1: sy, x2: mx, y2: my, color: annotColor });
      else if (currentTool === 'draw') {
        annotations.push({ tool: 'draw', points: freehandPts.slice(), color: annotColor });
        freehandPts = [];
      }
      redraw();
    });

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    }
    document.addEventListener('keydown', onKey);

    function cleanup() {
      document.removeEventListener('keydown', onKey);
      editorOverlay.remove();
    }

    function redraw() {
      if (!annCtx) return;
      annCtx.clearRect(0, 0, annCanvas.width, annCanvas.height);
      annotations.forEach((a) => {
        if (a.tool === 'arrow') drawArrow(annCtx, a.x1!, a.y1!, a.x2!, a.y2!, a.color);
        else if (a.tool === 'circle') {
          annCtx.strokeStyle = a.color;
          annCtx.lineWidth = 2;
          annCtx.beginPath();
          annCtx.ellipse(
            (a.x1! + a.x2!) / 2,
            (a.y1! + a.y2!) / 2,
            Math.abs(a.x2! - a.x1!) / 2,
            Math.abs(a.y2! - a.y1!) / 2,
            0,
            0,
            Math.PI * 2,
          );
          annCtx.stroke();
        } else if (a.tool === 'draw') drawFreehand(annCtx, a.points!, a.color);
        else if (a.tool === 'text') {
          annCtx.fillStyle = a.color;
          annCtx.font = 'bold 16px sans-serif';
          annCtx.fillText(a.text!, a.x!, a.y!);
        }
      });
    }
  });
}

/** A rectangle in CSS/viewport pixels, as measured from pointer coordinates. */
interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How long captureArea waits for a library coming over the NETWORK before committing to the
 * native capture. Kept far inside the ~5s transient-activation window opened by the click on the
 * capture button — see {@link captureArea}. Long enough that a CDN fetch on an ordinary
 * connection still wins, short enough that a request which merely hangs cannot spend the
 * activation.
 *
 * The bundled import gets its own, much longer bound ({@link BUNDLED_IMPORT_TIMEOUT_MS}) rather
 * than this one: it resolves from the app's own origin and cannot be refused, so racing it this
 * tightly would push users into a screen-share prompt purely because a local chunk took a moment.
 */
const LIBRARY_GRACE_MS = 750;

/** Resolve to the promise's value if it settles within `ms`, otherwise to null. Never rejects. */
function settledWithin<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/**
 * Refuse a frame that is not this tab, as early as possible.
 *
 * The share picker lets the user hand over a whole screen or another window despite
 * `preferCurrentTab`, and viewport coordinates cannot be located in either. Called the moment the
 * frame arrives rather than at crop time, so the user is told before spending a careful drag on a
 * selection that was never going to work. Chromium-only signal, hence the undefined check rather
 * than a plain equality test — {@link viewportScale}'s aspect-ratio test is the weaker fallback
 * for browsers that do not report it.
 */
function assertTabSurface(shot: DisplayFrame): void {
  if (shot.displaySurface && shot.displaySurface !== 'browser') {
    throw new ScreenshotCaptureError(
      'wrong-surface',
      'A whole screen or window was shared instead of this tab, so the selected area cannot be located in it',
    );
  }
}

/**
 * How many captured-frame pixels make up one CSS pixel of the viewport.
 *
 * The frame arrives in device pixels, so this absorbs devicePixelRatio AND browser zoom without
 * either having to be read directly (`devicePixelRatio` alone gets zoom wrong on several
 * platforms). Deriving it from the frame we actually received is the only measure that stays true.
 *
 * Also throws when the two axes disagree, which means the shared surface is not this tab's
 * viewport. That is the fallback for browsers which do not report `displaySurface` — see
 * {@link assertTabSurface} — because cropping viewport coordinates out of a screen frame would
 * silently return a picture of the wrong region, and the user would attach it to a bug report
 * believing it shows what they selected.
 */
function viewportScale(shot: DisplayFrame): number {
  const { canvas } = shot;
  if (canvas.width < 1 || canvas.height < 1 || shot.innerWidth < 1 || shot.innerHeight < 1) {
    throw new ScreenshotCaptureError('failed', 'The captured frame was empty');
  }
  assertTabSurface(shot);
  // Measured against the viewport AS IT WAS when the frame was taken, not as it is now — the
  // two can differ, and using the live values would fold a resize into the scale silently.
  const scaleX = canvas.width / shot.innerWidth;
  const scaleY = canvas.height / shot.innerHeight;
  const drift = Math.abs(scaleX - scaleY) / Math.max(scaleX, scaleY);
  if (drift > 0.02) {
    throw new ScreenshotCaptureError(
      'wrong-surface',
      'The shared surface is not this tab, so the selected area cannot be located in it',
    );
  }
  return (scaleX + scaleY) / 2;
}

/**
 * Cut `rect` (viewport pixels, measured NOW) out of a frame captured earlier (device pixels).
 *
 * The two coordinate systems share an origin — the top-left of the layout viewport, which is
 * document position (scrollX, scrollY) in both — but they are NOT guaranteed to share an extent,
 * and the difference is routine rather than exceptional: while a tab capture is running Chrome
 * shows a "sharing this tab" infobar ABOVE the web contents, which shrinks the viewport for
 * exactly the interval the frame is taken in. Measured on desktop Chrome: 1187x807 before,
 * 1187x755 during, 1187x807 after. So the frame covers only the TOP `shot.innerHeight` CSS
 * pixels of the viewport the user is now selecting in.
 *
 * Requiring the two to match therefore refuses every native capture, and requiring nothing at all
 * returns a picture of the wrong place. What actually protects the result is the bounds check:
 * shift the rectangle by however far the page has scrolled since the frame was taken, then refuse
 * a selection that reaches past what the frame holds. Scroll drift and a shrunken viewport are
 * then handled by one test, and an in-bounds selection is correct under either.
 */
function cropFrame(shot: DisplayFrame, rect: ViewportRect): HTMLCanvasElement {
  const frame = shot.canvas;
  const scale = viewportScale(shot);
  // No scroll offset is added for the FRAME's own origin — the frame IS the viewport, unlike the
  // html2canvas path, which renders the whole document and must add scrollX/scrollY. What is
  // added is the DRIFT: how far the page scrolled between the capture and the selection.
  const shiftX = window.scrollX - shot.scrollX;
  const shiftY = window.scrollY - shot.scrollY;
  const sourceX = rect.x + shiftX;
  const sourceY = rect.y + shiftY;
  // One pixel of slack for a fractional scroll position; anything more and the user has selected
  // something the frame never held.
  if (
    sourceX < -1 ||
    sourceY < -1 ||
    sourceX + rect.width > shot.innerWidth + 1 ||
    sourceY + rect.height > shot.innerHeight + 1
  ) {
    throw new ScreenshotCaptureError(
      'failed',
      'The selected area is outside the captured screenshot — the page may have scrolled, or the selection may have reached below what was captured. Try selecting again without scrolling.',
    );
  }
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(rect.width * scale));
  out.height = Math.max(1, Math.round(rect.height * scale));
  const ctx = out.getContext('2d');
  if (!ctx) throw new ScreenshotCaptureError('failed', 'Could not open a canvas for the selected area');
  ctx.drawImage(
    frame,
    Math.round(Math.max(0, sourceX) * scale),
    Math.round(Math.max(0, sourceY) * scale),
    out.width,
    out.height,
    0,
    0,
    out.width,
    out.height,
  );
  return out;
}

/**
 * Area capture: the user drags a selection rectangle, then annotates the captured
 * region. Resolves with a compressed data URL, or null if cancelled / too small.
 *
 * Rejects with a {@link ScreenshotCaptureError} when a capture was actually attempted and
 * failed — a caller must be able to tell that apart from a deliberate cancel.
 *
 * ORDER MATTERS, and not for the obvious reason. `getDisplayMedia` requires TRANSIENT USER
 * ACTIVATION, and per HTML's "activation triggering input event" list a mouse gesture stamps
 * that at mousedown/pointerdown — NOT at release (`pointerup` counts only for non-mouse input).
 * So the ~5s budget starts when the user presses, and someone framing a region carefully spends
 * it. Grabbing the frame after the drag would therefore fail on exactly the slow, deliberate
 * selections this feature is for. Instead the frame is taken UP FRONT, on the activation from
 * the button click, and the selection is cut out of it afterwards — {@link cropFrame} corrects
 * for any scrolling the user does in between.
 */
export function captureArea(qualityPct = 80, maxSizeKb = 500): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);

  /** html2canvas renders the whole document, so viewport coordinates need the scroll offset. */
  const withLibrary = (fn: Html2CanvasFn): Promise<HTMLCanvasElement | null> =>
    selectRegion().then((rect) =>
      rect
        ? fn(document.body, {
            x: rect.x + window.scrollX,
            y: rect.y + window.scrollY,
            width: rect.width,
            height: rect.height,
            useCORS: true,
            logging: false,
          }).catch((err: unknown) => {
            throw err instanceof ScreenshotCaptureError
              ? err
              : new ScreenshotCaptureError(
                  'failed',
                  err instanceof Error ? err.message : 'The screenshot library could not render this page',
                );
          })
        : null,
    );

  return loadLocalHtml2Canvas()
    .then((local) => {
      // The normal path, and the one that makes this feature usable: the library is already here
      // or resolves from this origin, so the user drags a rectangle and gets a screenshot — no
      // permission prompt, no screen sharing, exactly what the Blazor widget does. Awaiting this
      // is bounded (BUNDLED_IMPORT_TIMEOUT_MS), so a stalled chunk cannot hang the capture or
      // quietly spend the activation the fallback below still needs.
      if (local) return withLibrary(local);

      // No local copy: either the host named its own URL, or this SDK is being loaded without a
      // bundler to resolve the dependency. Now — and only now — a NETWORK fetch is the only way
      // to get the library, so it has to be raced against the activation window.
      const library = ensureHtml2Canvas().then(
        (fn) => ({ fn }),
        (err: unknown) => ({ err }),
      );
      return settledWithin(library, LIBRARY_GRACE_MS).then((lib) => {
        if (lib && 'fn' in lib) return withLibrary(lib.fn);
        // The fetch failed or is still in flight. The browser's own Screen Capture API needs no
        // script at all, so take one viewport frame now and cut the selection out of it.
        return captureDisplayFrame().then(
          (shot) => {
            // Before the drag, not after it: a screen or window share can never be cropped to
            // viewport coordinates, and finding that out costs the user nothing here.
            assertTabSurface(shot);
            return selectRegion().then((rect) => (rect ? cropFrame(shot, rect) : null));
          },
          (nativeErr: unknown) =>
            // The native path is out. Now — and only now — it is worth waiting for the library:
            // the grace period expiring means "not ready yet", NOT "will never arrive", and on a
            // platform with no getDisplayMedia at all (iOS Safari) it is the only path there ever
            // was. Abandoning it here would reject a capture that is still perfectly able to
            // succeed — which is what the pre-fix code, for all its faults, got right.
            library.then((late) => {
              if ('fn' in late) return withLibrary(late.fn);
              // Nothing here can capture. Lead with the library's cause when the native path never
              // existed: "this browser cannot capture the screen" is true but useless, while "the
              // library was blocked" is something the host can act on. Matches captureFullPage.
              throw nativeErr instanceof ScreenshotCaptureError && nativeErr.reason === 'unsupported'
                ? late.err
                : nativeErr;
            }),
        );
      });
    })
    .then((canvas) => (canvas ? openAnnotationEditor(canvas, qualityPct, maxSizeKb) : null));
}

/**
 * Put up the drag-to-select overlay and resolve with the chosen rectangle in viewport pixels,
 * or null if the user cancelled with Escape or drew something too small to be a screenshot.
 * Never rejects — a cancel is not a failure.
 */
function selectRegion(): Promise<ViewportRect | null> {
  return new Promise<ViewportRect | null>((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'ww-feedback-capture-overlay';
    const selection = document.createElement('div');
    selection.className = 'ww-feedback-capture-selection';
    overlay.appendChild(selection);
    document.body.appendChild(overlay);
    let startX = 0;
    let startY = 0;
    let capturing = false;

    function handleCaptureEnd(mx: number, my: number) {
      capturing = false;
      cleanup();
      const rect: ViewportRect = {
        x: Math.min(mx, startX),
        y: Math.min(my, startY),
        width: Math.abs(mx - startX),
        height: Math.abs(my - startY),
      };
      resolve(rect.width < 10 || rect.height < 10 ? null : rect);
    }

    overlay.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startY = e.clientY;
      capturing = true;
      selection.style.left = startX + 'px';
      selection.style.top = startY + 'px';
      selection.style.width = '0px';
      selection.style.height = '0px';
      selection.style.display = 'block';
    });
    overlay.addEventListener('mousemove', (e) => {
      if (!capturing) return;
      selection.style.left = Math.min(e.clientX, startX) + 'px';
      selection.style.top = Math.min(e.clientY, startY) + 'px';
      selection.style.width = Math.abs(e.clientX - startX) + 'px';
      selection.style.height = Math.abs(e.clientY - startY) + 'px';
    });
    overlay.addEventListener('mouseup', (e) => {
      if (!capturing) return;
      handleCaptureEnd(e.clientX, e.clientY);
    });

    overlay.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        capturing = true;
        selection.style.left = startX + 'px';
        selection.style.top = startY + 'px';
        selection.style.width = '0px';
        selection.style.height = '0px';
        selection.style.display = 'block';
        e.preventDefault();
      },
      { passive: false },
    );
    overlay.addEventListener(
      'touchmove',
      (e) => {
        if (!capturing || e.touches.length !== 1) return;
        const t = e.touches[0];
        selection.style.left = Math.min(t.clientX, startX) + 'px';
        selection.style.top = Math.min(t.clientY, startY) + 'px';
        selection.style.width = Math.abs(t.clientX - startX) + 'px';
        selection.style.height = Math.abs(t.clientY - startY) + 'px';
        e.preventDefault();
      },
      { passive: false },
    );
    overlay.addEventListener('touchend', (e) => {
      if (!capturing) return;
      const t = e.changedTouches[0];
      handleCaptureEnd(t.clientX, t.clientY);
    });

    // Every exit runs this. The old code removed the overlay on capture but left the keydown
    // listener attached, so a later Escape resolved an already-settled promise (harmless) and
    // the listener outlived the widget (a leak that compounds per capture).
    function cleanup() {
      overlay.remove();
      document.removeEventListener('keydown', onEscape);
    }

    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    }
    document.addEventListener('keydown', onEscape);
  });
}

/** html2canvas fallback for full-page capture. Renders the viewport, not the whole document. */
function captureFullPageWithLibrary(): Promise<HTMLCanvasElement> {
  return ensureHtml2Canvas().then((html2canvas) =>
    html2canvas(document.body, {
      useCORS: true,
      logging: false,
      scale: 1,
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: -window.scrollX,
      scrollY: -window.scrollY,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    }),
  );
}

interface DisplayMediaNavigator {
  mediaDevices?: {
    getDisplayMedia?: (constraints: Record<string, unknown>) => Promise<MediaStream>;
  };
}

/** Map a getDisplayMedia rejection onto a reason the widget can explain. */
function displayMediaFailure(err: unknown): ScreenshotCaptureError {
  if (err instanceof ScreenshotCaptureError) return err;
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return new ScreenshotCaptureError('permission', 'Screen capture was declined or is not allowed on this page');
  }
  if (name === 'NotSupportedError' || name === 'NotFoundError') {
    return new ScreenshotCaptureError('unsupported', 'This browser cannot capture the screen');
  }
  return new ScreenshotCaptureError('failed', err instanceof Error ? err.message : 'Screen capture failed');
}

/**
 * One captured frame, plus what the browser says was actually shared (Chromium only) and the
 * page geometry AT THE MOMENT OF CAPTURE.
 *
 * The geometry is not bookkeeping: the frame is grabbed before the user selects, and nothing
 * stops them scrolling in between (the overlay is `position: fixed` and sets only
 * `touch-action: none`, which blocks touch panning but not the wheel or arrow keys). Without
 * the scroll position recorded here, a rectangle measured against the scrolled viewport would
 * be cut out of the pre-scroll frame and quietly return a picture of somewhere else.
 */
interface DisplayFrame {
  canvas: HTMLCanvasElement;
  displaySurface?: string;
  scrollX: number;
  scrollY: number;
  innerWidth: number;
  innerHeight: number;
}

/** A frame must arrive within this long, or the capture is abandoned. See captureDisplayFrame. */
const DISPLAY_FRAME_TIMEOUT_MS = 10000;

/**
 * Grab a single frame of the shared surface with the browser's own Screen Capture API.
 *
 * This is the path that needs NO third-party script, which is why it is the one that keeps
 * working under a `script-src 'self'` CSP. Both buttons now share it: full page uses the frame
 * whole, area capture crops it.
 *
 * MUST be called while the user's click still counts as transient activation — the browser
 * refuses getDisplayMedia otherwise.
 */
function captureDisplayFrame(): Promise<DisplayFrame> {
  const nav = navigator as Navigator & DisplayMediaNavigator;
  const getDisplayMedia = nav.mediaDevices?.getDisplayMedia;
  if (!getDisplayMedia) {
    return Promise.reject(new ScreenshotCaptureError('unsupported', 'This browser cannot capture the screen'));
  }
  return getDisplayMedia.call(nav.mediaDevices, { video: { displaySurface: 'browser' }, preferCurrentTab: true }).then(
    (stream: MediaStream) => {
      const track = stream.getVideoTracks()[0];
      return new Promise<DisplayFrame>((resolve, reject) => {
        // Every exit stops the track and settles exactly once. The widget is hidden for the
        // duration of a capture, so a promise that never settles leaves it invisible with no way
        // back but a page reload — and `loadedmetadata` genuinely never fires if the user stops
        // sharing from the browser's own bar before the first frame arrives.
        let settled = false;
        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          // Settle FIRST. A stream that somehow arrived with no video track would otherwise
          // throw here, after `settled` is already true, and the promise would never settle —
          // the exact hang this guard exists to prevent.
          fn();
          track?.stop();
        };
        const fail = (err: unknown) => finish(() => reject(displayMediaFailure(err)));
        const timer = setTimeout(
          () => fail(new ScreenshotCaptureError('failed', 'Timed out waiting for the screen capture')),
          DISPLAY_FRAME_TIMEOUT_MS,
        );
        setTimeout(() => {
          const video = document.createElement('video');
          video.srcObject = stream;
          video.onerror = () => fail(new Error('video error'));
          video.onloadedmetadata = () => {
            video
              .play()
              .then(() => {
                const c = document.createElement('canvas');
                c.width = video.videoWidth;
                c.height = video.videoHeight;
                const ctx = c.getContext('2d');
                if (!ctx) {
                  fail(new ScreenshotCaptureError('failed', 'Could not open a canvas for the capture'));
                  return;
                }
                ctx.drawImage(video, 0, 0);
                const surface =
                  typeof track.getSettings === 'function' ? track.getSettings().displaySurface : undefined;
                finish(() =>
                  resolve({
                    canvas: c,
                    displaySurface: surface,
                    scrollX: window.scrollX,
                    scrollY: window.scrollY,
                    innerWidth: window.innerWidth,
                    innerHeight: window.innerHeight,
                  }),
                );
              })
              .catch(fail);
          };
        }, 200);
      });
    },
    (err: unknown) => {
      throw displayMediaFailure(err);
    },
  );
}

/**
 * Full-page capture: prefer the native Screen Capture API (getDisplayMedia), then
 * fall back to html2canvas. Both paths feed the annotation editor.
 *
 * Rejects with a {@link ScreenshotCaptureError} when both paths fail. It previously swallowed
 * that into `null`, which the caller reads as "the user cancelled" — so a widget on a host
 * where neither path works appeared to do nothing at all when the button was pressed.
 */
export function captureFullPage(qualityPct = 80, maxSizeKb = 500): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return captureDisplayFrame()
    .then((shot) => shot.canvas)
    .catch((nativeErr: unknown) =>
      captureFullPageWithLibrary().catch((libraryErr: unknown) => {
        // Report whichever cause the user can act on. Declining the share picker is a choice
        // they can simply remake; "the CDN is blocked" is not something they can fix from here.
        if (nativeErr instanceof ScreenshotCaptureError && nativeErr.reason === 'permission') throw nativeErr;
        // html2canvas itself throws plain Errors; the documented contract is a typed one.
        throw libraryErr instanceof ScreenshotCaptureError
          ? libraryErr
          : new ScreenshotCaptureError(
              'failed',
              libraryErr instanceof Error ? libraryErr.message : 'The screenshot library could not render this page',
            );
      }),
    )
    .then((canvas) => openAnnotationEditor(canvas, qualityPct, maxSizeKb));
}
