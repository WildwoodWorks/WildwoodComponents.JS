// Shared Server-Sent Events plumbing for fetch-based SSE transports (AI flow runs,
// backend-orchestrated chat). SSE requests here are POSTs (the body carries the run/chat
// input), so callers use `fetch` + a stream reader rather than `EventSource` (GET-only).

export interface SseFrame {
  event: string;
  data: string;
}

/**
 * Stateful SSE frame parser: push raw text chunks (which may split a frame mid-way), get back the
 * complete frames so far. Frames are blank-line separated; only `event:` and `data:` fields are read.
 */
export function createSseParser(): {
  push: (chunk: string) => SseFrame[];
  flush: () => SseFrame[];
} {
  let buffer = '';
  return {
    push(chunk: string): SseFrame[] {
      buffer += chunk.replace(/\r\n/g, '\n');
      const frames: SseFrame[] = [];
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const frame = parseFrame(raw);
        if (frame) frames.push(frame);
      }
      return frames;
    },
    // Emit any residual frame the stream ended on without a trailing blank line.
    flush(): SseFrame[] {
      const raw = buffer.trim();
      buffer = '';
      if (!raw) return [];
      const frame = parseFrame(raw);
      return frame ? [frame] : [];
    },
  };
}

function parseFrame(raw: string): SseFrame | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) continue; // comment / heartbeat
    if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).replace(/^ /, ''));
  }
  if (dataLines.length === 0 && event === 'message') return null;
  return { event, data: dataLines.join('\n') };
}

/** True when the error (or the request's signal) represents a caller-initiated abort. */
export function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return err instanceof Error && err.name === 'AbortError';
}
