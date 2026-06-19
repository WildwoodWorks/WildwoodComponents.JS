// Backend-orchestrated AI chat over Server-Sent Events (WS6C / D6).
//
// Unlike the existing non-streaming `client.ai.*` flow, this drives a CALLER-OWNED endpoint that
// orchestrates a tool-using turn server-side (e.g. a GCM `/api/chat/stream`) and streams progress as
// SSE: `tool.started` / `tool.result` while tools run, an optional `context.changed`, then a terminal
// `done` / `confirm.required` (full result) or `error`. The endpoint is POST (the request body carries
// the conversation), so we use `fetch` + a stream reader rather than `EventSource` (GET-only).

export interface OrchestratedChatMessage {
  role: string;
  content: string;
}

export interface OrchestratedChatRequest {
  configurationId: string;
  messages: OrchestratedChatMessage[];
  /** Tool-call ids the user has approved this turn (resume-after-confirmation). */
  approvedToolCallIds?: string[];
  /** Tool-call ids the user has declined this turn. */
  rejectedToolCallIds?: string[];
}

export interface OrchestratedPendingToolCall {
  id: string;
  tool: string;
  inputJson: string;
}

export interface OrchestratedToolActivity {
  tool: string;
  inputJson?: string;
}

export interface OrchestratedChatResult {
  /** "done" | "confirmation_required" | "error". */
  status: string;
  reply?: string;
  error?: string;
  messages?: OrchestratedChatMessage[];
  pendingToolCalls?: OrchestratedPendingToolCall[];
  toolActivity?: OrchestratedToolActivity[];
}

export interface OrchestratedChatHandlers {
  onToolStarted?: (e: { tool: string; input?: string }) => void;
  onToolResult?: (e: { tool: string }) => void;
  /** A server-side write changed app data — the client should refresh affected views. */
  onContextChanged?: (data: unknown) => void;
  /** A write needs user approval; resume by re-sending with approved/rejected tool-call ids. */
  onConfirmRequired?: (result: OrchestratedChatResult) => void;
  onDone?: (result: OrchestratedChatResult) => void;
  onError?: (message: string) => void;
}

export interface StreamOrchestratedChatOptions {
  /** Absolute or app-relative URL of the orchestrating SSE endpoint. */
  endpoint: string;
  request: OrchestratedChatRequest;
  handlers: OrchestratedChatHandlers;
  /** Bearer token (e.g. the Wildwood JWT) for the orchestrating app's auth. */
  token?: string | null;
  signal?: AbortSignal;
  /** Injectable for testing. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

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

function safeParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * Maps the JSON of one SSE frame to the matching handler. Returns true if the frame was a TERMINAL
 * event (done / confirm.required / error) — the single source of truth the transport uses to stop the
 * stream, so the terminal-event set is never duplicated. Exported for unit testing.
 */
export function dispatchSseFrame(frame: SseFrame, handlers: OrchestratedChatHandlers): boolean {
  switch (frame.event) {
    case 'tool.started': {
      const d = safeParse<{ tool?: string; input?: string }>(frame.data);
      handlers.onToolStarted?.({ tool: d?.tool ?? '', input: d?.input });
      return false;
    }
    case 'tool.result': {
      const d = safeParse<{ tool?: string }>(frame.data);
      handlers.onToolResult?.({ tool: d?.tool ?? '' });
      return false;
    }
    case 'context.changed':
      handlers.onContextChanged?.(safeParse<unknown>(frame.data));
      return false;
    case 'confirm.required':
      handlers.onConfirmRequired?.(
        safeParse<OrchestratedChatResult>(frame.data) ?? { status: 'confirmation_required' },
      );
      return true;
    case 'done': {
      const result = safeParse<OrchestratedChatResult>(frame.data) ?? { status: 'done' };
      // A terminal result that carries an error status is a failure, not a successful reply.
      if (result.status === 'error') handlers.onError?.(result.error ?? 'Chat error.');
      else handlers.onDone?.(result);
      return true;
    }
    case 'error': {
      const d = safeParse<{ error?: string }>(frame.data);
      handlers.onError?.(d?.error ?? 'Chat error.');
      return true;
    }
    default:
      return false;
  }
}

/**
 * POSTs the chat request to the orchestrating endpoint and dispatches its SSE events to `handlers`.
 * Resolves when the stream ends. Never throws for transport/HTTP/abort failures — those are reported
 * via `handlers.onError` (abort is silent), so a caller can `await` it without a try/catch.
 */
export async function streamOrchestratedChat(opts: StreamOrchestratedChatOptions): Promise<void> {
  const { endpoint, request, handlers, token, signal } = opts;
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;

  const parser = createSseParser();
  let terminalSeen = false;
  // Dispatch frames, stopping at the FIRST terminal event so a stream can't deliver two terminal
  // callbacks (e.g. an `error` then `done`, or anything after `confirm.required`).
  const emit = (frames: SseFrame[]): void => {
    for (const frame of frames) {
      if (terminalSeen) return;
      if (dispatchSseFrame(frame, handlers)) terminalSeen = true;
    }
  };

  let response: Response;
  try {
    response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
      signal,
    });
  } catch (err) {
    if (!isAbort(err, signal)) handlers.onError?.(err instanceof Error ? err.message : 'Chat request failed.');
    return;
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.text()).trim().slice(0, 300);
    } catch {
      /* best-effort: keep the status-only message */
    }
    handlers.onError?.(`Chat request failed (HTTP ${response.status})${detail ? `: ${detail}` : ''}.`);
    return;
  }

  // No streaming body (e.g. React Native's fetch leaves response.body null) — read the whole response
  // and parse it at once. Live progress is lost, but the terminal done/confirm/error still arrives.
  if (!response.body) {
    try {
      const text = await response.text();
      emit(parser.push(text));
      emit(parser.flush());
    } catch (err) {
      if (!isAbort(err, signal)) handlers.onError?.(err instanceof Error ? err.message : 'Chat read failed.');
      return;
    }
    if (!terminalSeen && !signal?.aborted) handlers.onError?.('The chat stream ended unexpectedly.');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      emit(parser.push(decoder.decode(value, { stream: true })));
      // Got the terminal event — stop reading instead of waiting for the server to close the socket.
      if (terminalSeen) break;
    }
    emit(parser.push(decoder.decode())); // flush any buffered multi-byte tail
    emit(parser.flush()); // dispatch a final frame not terminated by a blank line
  } catch (err) {
    if (!isAbort(err, signal)) handlers.onError?.(err instanceof Error ? err.message : 'Chat stream failed.');
    return;
  } finally {
    // Release the lock / cancel the body (no-op once fully read; tears down the request on abort/error).
    void reader.cancel().catch(() => {
      /* reader already done or cancelled */
    });
  }

  if (!terminalSeen && !signal?.aborted) handlers.onError?.('The chat stream ended unexpectedly.');
}
