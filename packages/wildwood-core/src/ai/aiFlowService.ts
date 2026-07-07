// AI Flows (LangGraph) service - ported from WildwoodComponents.Blazor/Services/AIFlowService.cs
//
// Client for the app-facing AI Flows with LangChain endpoints (api/ai/flows). Runs execute the
// published version and stream over SSE; the request is a POST (the body carries the run input),
// so we use `fetch` + a stream reader rather than `EventSource` (GET-only, no Authorization
// header). GET endpoints use the same transport so per-component apiBaseUrl/appId overrides
// apply uniformly, mirroring the Blazor service's dedicated HttpClient.

import type { WildwoodConfig } from '../client/types.js';
import type { WildwoodEventEmitter } from '../events/eventEmitter.js';
import type { AIFlowModel, AIFlowRunEvent, AIFlowRunResult, AIFlowRunSummary } from './types.js';

export interface AIFlowRequestOptions {
  /** Override the API base INCLUDING the /api segment (e.g. "https://host/api"). Defaults to config.baseUrl + "/api". */
  apiBaseUrl?: string;
  /** Override the app whose flows are targeted (sent as ?requestedAppId=). Defaults to config.appId. */
  appId?: string;
  signal?: AbortSignal;
  /** Injectable for testing. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** Invoked for each SSE frame of a flow run stream. */
export type AIFlowEventHandler = (event: AIFlowRunEvent) => void | Promise<void>;

interface SseFrame {
  event: string;
  data: string;
}

/**
 * Stateful SSE frame parser: push raw text chunks (which may split a frame mid-way), get back the
 * complete frames so far. Frames are blank-line separated; only `event:` and `data:` fields are
 * read. Same idiom as react-shared's orchestratedChat transport.
 */
function createSseParser(): {
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

function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return err instanceof Error && err.name === 'AbortError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class AIFlowService {
  /** Token the one-shot 401 signal last fired for; re-armed when the token changes. */
  private lastAuthFailureToken: string | undefined;

  constructor(
    private config: WildwoodConfig,
    private events: WildwoodEventEmitter,
    private getAccessToken: () => string | null,
  ) {}

  async getFlows(options?: AIFlowRequestOptions): Promise<AIFlowModel[]> {
    try {
      const fetchFn = options?.fetchImpl ?? globalThis.fetch;
      const response = await fetchFn(`${this.apiBase(options)}/ai/flows${this.appQuery(options)}`, {
        headers: this.buildHeaders({ Accept: 'application/json' }),
        signal: options?.signal,
      });
      if (!this.ensureAuthorized(response.status) || !response.ok) return [];
      return ((await response.json()) as AIFlowModel[]) ?? [];
    } catch (err) {
      console.warn('[AIFlowService] Failed to load AI flows:', err);
      return [];
    }
  }

  /**
   * Runs a flow, invoking `onEvent` for each SSE frame, and returns the terminal outcome
   * (done/interrupt/error). Never throws: transport failures come back as status 'failed',
   * abort as 'cancelled'.
   */
  runFlow(
    flowId: string,
    inputJson: string,
    threadId?: string | null,
    onEvent?: AIFlowEventHandler,
    options?: AIFlowRequestOptions,
  ): Promise<AIFlowRunResult> {
    const url = `${this.apiBase(options)}/ai/flows/${encodeURIComponent(flowId)}/runs/stream${this.appQuery(options)}`;
    return this.stream(url, JSON.stringify({ inputJson, threadId: threadId ?? null }), onEvent, options);
  }

  /** Approves or rejects a pending human-review interrupt; approve streams the resumed run. */
  resolveInterrupt(
    runId: string,
    approve: boolean,
    valueJson?: string | null,
    onEvent?: AIFlowEventHandler,
    options?: AIFlowRequestOptions,
  ): Promise<AIFlowRunResult> {
    const url = `${this.apiBase(options)}/ai/flows/runs/${encodeURIComponent(runId)}/resume${this.appQuery(options)}`;
    const body = JSON.stringify({ action: approve ? 'approve' : 'reject', valueJson: valueJson ?? null });
    return this.stream(url, body, onEvent, options);
  }

  async getThreadRuns(threadId: string, options?: AIFlowRequestOptions): Promise<AIFlowRunSummary[]> {
    try {
      const fetchFn = options?.fetchImpl ?? globalThis.fetch;
      const response = await fetchFn(
        `${this.apiBase(options)}/ai/flows/threads/${encodeURIComponent(threadId)}/runs${this.appQuery(options)}`,
        {
          headers: this.buildHeaders({ Accept: 'application/json' }),
          signal: options?.signal,
        },
      );
      if (!this.ensureAuthorized(response.status) || !response.ok) return [];
      return ((await response.json()) as AIFlowRunSummary[]) ?? [];
    } catch (err) {
      console.warn('[AIFlowService] Failed to load thread runs:', err);
      return [];
    }
  }

  // ------------------------------------------------------------------

  private async stream(
    url: string,
    body: string,
    onEvent: AIFlowEventHandler | undefined,
    options?: AIFlowRequestOptions,
  ): Promise<AIFlowRunResult> {
    const result: AIFlowRunResult = { status: 'unknown', totalTokens: 0 };
    const signal = options?.signal;
    const fetchFn = options?.fetchImpl ?? globalThis.fetch;
    try {
      const response = await fetchFn(url, {
        method: 'POST',
        headers: this.buildHeaders({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }),
        body,
        signal,
      });

      if (!this.ensureAuthorized(response.status)) {
        result.status = 'failed';
        result.errorMessage = response.status === 403 ? "You don't have access to this flow." : 'Not authorized';
        return result;
      }
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        result.status = 'failed';
        result.errorMessage = `${response.status}: ${detail}`;
        return result;
      }

      // The reject path (and any non-approve resolution) responds with a plain JSON body,
      // not an SSE stream — map it to a terminal result.
      const mediaType = response.headers.get('content-type') ?? '';
      if (!mediaType.toLowerCase().startsWith('text/event-stream')) {
        result.status = 'cancelled';
        return result;
      }

      const parser = createSseParser();
      let terminalSeen = false;
      // Dispatch frames, stopping at the FIRST terminal event (done/error) so a stream can't
      // deliver two terminal outcomes or overwrite the result after it settled.
      const emit = async (frames: SseFrame[]): Promise<void> => {
        for (const frame of frames) {
          if (terminalSeen) return;
          if (await this.dispatch(frame, onEvent, result)) terminalSeen = true;
        }
      };

      // No streaming body (e.g. React Native's fetch leaves response.body null) — read the whole
      // response and parse it at once. Live progress is lost, but the terminal result still arrives.
      if (!response.body) {
        const text = await response.text();
        await emit(parser.push(text));
        await emit(parser.flush());
        return result;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          await emit(parser.push(decoder.decode(value, { stream: true })));
          // Got the terminal event — stop reading instead of waiting for the server to close.
          if (terminalSeen) break;
        }
        await emit(parser.push(decoder.decode())); // flush any buffered multi-byte tail
        await emit(parser.flush()); // dispatch a final frame not terminated by a blank line
      } finally {
        // Release the lock / cancel the body (no-op once fully read; tears down the request otherwise).
        void reader.cancel().catch(() => {
          /* reader already done or cancelled */
        });
      }
    } catch (err) {
      if (isAbort(err, signal)) {
        if (result.status === 'unknown') result.status = 'cancelled';
      } else {
        console.warn('[AIFlowService] AI flow run stream failed:', err);
        result.status = 'failed';
        result.errorMessage = err instanceof Error ? err.message : String(err);
      }
    }
    return result;
  }

  /**
   * Maps one SSE frame onto the run result and forwards it to `onEvent`. Returns true when the
   * frame was a terminal event (done/error). A truncated/unparseable frame leaves data undefined,
   * so every property read is guarded.
   */
  private async dispatch(
    frame: SseFrame,
    onEvent: AIFlowEventHandler | undefined,
    result: AIFlowRunResult,
  ): Promise<boolean> {
    let data: unknown;
    if (frame.data.length > 0) {
      try {
        data = JSON.parse(frame.data);
      } catch {
        /* leave undefined (malformed frame tolerance) */
      }
    }

    const obj = isRecord(data) ? data : undefined;
    switch (frame.event) {
      case 'run_started':
        // Server emits this first, carrying the run + thread ids the client needs
        // for resume and thread continuity.
        if (typeof obj?.runId === 'string') result.runId = obj.runId;
        if (typeof obj?.threadId === 'string') result.threadId = obj.threadId;
        break;
      case 'done':
        result.status = typeof obj?.status === 'string' ? obj.status : 'succeeded';
        if (obj !== undefined && obj.output !== undefined && obj.output !== null) {
          result.outputJson = JSON.stringify(obj.output);
        }
        break;
      case 'interrupt':
        result.status = 'interrupted';
        if (obj !== undefined && 'payload' in obj) {
          result.interruptPayloadJson = JSON.stringify(obj.payload);
        }
        break;
      case 'error':
        result.status = 'failed';
        result.errorMessage = typeof obj?.message === 'string' ? obj.message : 'Run failed';
        break;
      case 'usage':
        if (typeof obj?.totalTokens === 'number' && Number.isFinite(obj.totalTokens)) {
          result.totalTokens += obj.totalTokens;
        }
        break;
    }

    if (onEvent) await onEvent({ event: frame.event, data });
    return frame.event === 'done' || frame.event === 'error';
  }

  private ensureAuthorized(status: number): boolean {
    // Only 401 is an authentication failure. 403 is a permission/feature denial
    // (e.g. tier lacks AI_FLOWS) — the token is valid, so don't signal session
    // expiry (which prompts re-login).
    if (status === 401) {
      // Fire once per token lifetime — a long SSE run can hit many 401s and we
      // don't want to flood a shared re-login handler.
      const token = this.getAccessToken() ?? '';
      if (this.lastAuthFailureToken !== token) {
        this.lastAuthFailureToken = token;
        this.events.emit('sessionExpired');
      }
      return false;
    }
    return status !== 403;
  }

  private buildHeaders(extra: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.config.apiKey) headers['X-API-Key'] = this.config.apiKey;
    const token = this.getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  private apiBase(options?: AIFlowRequestOptions): string {
    if (options?.apiBaseUrl) return options.apiBaseUrl.replace(/\/+$/, '');
    return `${this.config.baseUrl.replace(/\/+$/, '')}/api`;
  }

  private appQuery(options?: AIFlowRequestOptions): string {
    const appId = options?.appId ?? this.config.appId;
    return appId ? `?requestedAppId=${encodeURIComponent(appId)}` : '';
  }
}
