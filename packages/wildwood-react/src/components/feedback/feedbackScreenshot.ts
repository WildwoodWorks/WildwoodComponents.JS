// Screenshot capture + annotation for the FeedbackComponent.
// Ported from WildwoodAdmin/wwwroot/js/feedback-widget.js (ensureHtml2Canvas,
// compressScreenshot, captureArea, captureFullPage, openAnnotationEditor) to keep
// the React widget at feature parity with the Razor/Blazor feedback widgets.
//
// html2canvas is NOT a bundled dependency — it is loaded lazily from a CDN the
// first time the user requests a screenshot. If it cannot be loaded (offline,
// CSP, etc.) capture is skipped gracefully and the form can still be submitted.
//
// The capture overlay and annotation editor are built directly on document.body
// (outside React) because they must sit above the page during selection/markup;
// their styles live in the global feedback CSS (ww-feedback-capture-* and
// ww-feedback-annotation-* rules).

const HTML2CANVAS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

type Html2CanvasFn = (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;

function getHtml2Canvas(): Html2CanvasFn | undefined {
  return (globalThis as unknown as { html2canvas?: Html2CanvasFn }).html2canvas;
}

let loadPromise: Promise<Html2CanvasFn> | null = null;

/** Lazily load html2canvas from the CDN (once). Rejects if it cannot be loaded. */
export function ensureHtml2Canvas(): Promise<Html2CanvasFn> {
  const existing = getHtml2Canvas();
  if (existing) return Promise.resolve(existing);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<Html2CanvasFn>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Screenshot capture is only available in the browser'));
      return;
    }
    const script = document.createElement('script');
    script.src = HTML2CANVAS_CDN;
    script.onload = () => {
      const fn = getHtml2Canvas();
      if (fn) resolve(fn);
      else reject(new Error('html2canvas failed to initialize'));
    };
    script.onerror = () => reject(new Error('Failed to load the screenshot library'));
    document.head.appendChild(script);
  });

  return loadPromise;
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

/**
 * Area capture: the user drags a selection rectangle, then annotates the captured
 * region. Resolves with a compressed data URL, or null if cancelled / too small.
 */
export function captureArea(qualityPct = 80, maxSizeKb = 500): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return ensureHtml2Canvas().then((html2canvas) => {
    return new Promise<string | null>((resolve) => {
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
        overlay.remove();
        const rect = {
          x: Math.min(mx, startX),
          y: Math.min(my, startY),
          width: Math.abs(mx - startX),
          height: Math.abs(my - startY),
        };
        if (rect.width < 10 || rect.height < 10) {
          resolve(null);
          return;
        }
        html2canvas(document.body, {
          x: rect.x + window.scrollX,
          y: rect.y + window.scrollY,
          width: rect.width,
          height: rect.height,
          useCORS: true,
          logging: false,
        })
          .then((canvas) => openAnnotationEditor(canvas, qualityPct, maxSizeKb))
          .then((result) => resolve(result))
          .catch(() => resolve(null));
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

      function onEscape(e: KeyboardEvent) {
        if (e.key === 'Escape') {
          overlay.remove();
          document.removeEventListener('keydown', onEscape);
          resolve(null);
        }
      }
      document.addEventListener('keydown', onEscape);
    });
  });
}

/** html2canvas fallback for full-page capture, then annotate. */
function captureFullPageFallback(qualityPct: number, maxSizeKb: number): Promise<string | null> {
  return ensureHtml2Canvas()
    .then((html2canvas) =>
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
      }).then((canvas) => openAnnotationEditor(canvas, qualityPct, maxSizeKb)),
    )
    .catch(() => null);
}

interface DisplayMediaNavigator {
  mediaDevices?: {
    getDisplayMedia?: (constraints: Record<string, unknown>) => Promise<MediaStream>;
  };
}

/**
 * Full-page capture: prefer the native Screen Capture API (getDisplayMedia), then
 * fall back to html2canvas. Both paths feed the annotation editor.
 */
export function captureFullPage(qualityPct = 80, maxSizeKb = 500): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const nav = navigator as Navigator & DisplayMediaNavigator;
  if (nav.mediaDevices && nav.mediaDevices.getDisplayMedia) {
    return nav.mediaDevices
      .getDisplayMedia({ video: { displaySurface: 'browser' }, preferCurrentTab: true })
      .then((stream) => {
        const track = stream.getVideoTracks()[0];
        return new Promise<HTMLCanvasElement>((resolve, reject) => {
          // Any failure here must reject (not hang): the widget is hidden during capture, so a
          // never-settling promise would leave it stuck invisible. Rejection routes to the fallback.
          const fail = (err: unknown) => {
            track.stop();
            reject(err instanceof Error ? err : new Error('Full-page capture failed'));
          };
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
                  c.getContext('2d')?.drawImage(video, 0, 0);
                  track.stop();
                  resolve(c);
                })
                .catch(fail);
            };
          }, 200);
        });
      })
      .then((canvas) => openAnnotationEditor(canvas, qualityPct, maxSizeKb))
      .catch(() => captureFullPageFallback(qualityPct, maxSizeKb));
  }
  return captureFullPageFallback(qualityPct, maxSizeKb);
}
