// Optional screenshot capture for the FeedbackComponent.
// Ported from WildwoodAdmin/wwwroot/js/feedback-widget.js (ensureHtml2Canvas +
// captureFullPageFallback + compressScreenshot).
//
// html2canvas is NOT a bundled dependency — it is loaded lazily from a CDN the
// first time the user requests a screenshot. If it cannot be loaded (offline,
// CSP, etc.) capture is skipped gracefully and the form can still be submitted.

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

/**
 * Capture the current viewport as a compressed JPEG data URL.
 * Returns null if the screenshot library is unavailable or capture fails.
 */
export async function captureViewportScreenshot(qualityPct = 80, maxSizeKb = 500): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  try {
    const html2canvas = await ensureHtml2Canvas();
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      logging: false,
      scale: 1,
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: -window.scrollX,
      scrollY: -window.scrollY,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    });
    return compressScreenshot(canvas, qualityPct, maxSizeKb);
  } catch {
    return null;
  }
}
