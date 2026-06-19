import { describe, it, expect, vi } from 'vitest';
import {
  createSseParser,
  dispatchSseFrame,
  streamOrchestratedChat,
  type OrchestratedChatHandlers,
} from '@wildwood/react-shared';

describe('createSseParser', () => {
  it('parses a complete frame', () => {
    const parser = createSseParser();
    expect(parser.push('event: done\ndata: {"status":"done"}\n\n')).toEqual([
      { event: 'done', data: '{"status":"done"}' },
    ]);
  });

  it('buffers a frame split across chunks', () => {
    const parser = createSseParser();
    expect(parser.push('event: tool.started\ndata: {"too')).toEqual([]);
    expect(parser.push('l":"x"}\n\n')).toEqual([{ event: 'tool.started', data: '{"tool":"x"}' }]);
  });

  it('parses multiple frames in one chunk and normalizes CRLF', () => {
    const parser = createSseParser();
    const frames = parser.push('event: a\r\ndata: 1\r\n\r\nevent: b\ndata: 2\n\n');
    expect(frames.map((f) => f.event)).toEqual(['a', 'b']);
    expect(frames.map((f) => f.data)).toEqual(['1', '2']);
  });

  it('skips comment/heartbeat lines', () => {
    const parser = createSseParser();
    expect(parser.push(': keep-alive\n\n')).toEqual([]);
  });
});

describe('dispatchSseFrame', () => {
  it('routes each event type to the matching handler', () => {
    const calls: string[] = [];
    const handlers: OrchestratedChatHandlers = {
      onToolStarted: (e) => calls.push(`started:${e.tool}`),
      onToolResult: (e) => calls.push(`result:${e.tool}`),
      onContextChanged: () => calls.push('context'),
      onConfirmRequired: (r) => calls.push(`confirm:${r.pendingToolCalls?.length ?? 0}`),
      onDone: (r) => calls.push(`done:${r.reply}`),
      onError: (m) => calls.push(`error:${m}`),
    };

    dispatchSseFrame({ event: 'tool.started', data: '{"tool":"search","input":"{}"}' }, handlers);
    dispatchSseFrame({ event: 'tool.result', data: '{"tool":"search"}' }, handlers);
    dispatchSseFrame({ event: 'context.changed', data: '{}' }, handlers);
    dispatchSseFrame(
      {
        event: 'confirm.required',
        data: '{"status":"confirmation_required","pendingToolCalls":[{"id":"1","tool":"add","inputJson":"{}"}]}',
      },
      handlers,
    );
    dispatchSseFrame({ event: 'done', data: '{"status":"done","reply":"hi"}' }, handlers);
    dispatchSseFrame({ event: 'error', data: '{"error":"boom"}' }, handlers);

    expect(calls).toEqual(['started:search', 'result:search', 'context', 'confirm:1', 'done:hi', 'error:boom']);
  });
});

describe('streamOrchestratedChat', () => {
  function sseResponse(text: string, status = 200): Response {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });
    return new Response(body, { status });
  }

  it('POSTs with auth + body and dispatches the stream in order', async () => {
    const seen: string[] = [];
    let captured: { url: unknown; init: RequestInit } | null = null;
    const fetchImpl = vi.fn(async (url: unknown, init: RequestInit) => {
      captured = { url, init };
      return sseResponse(
        'event: tool.started\ndata: {"tool":"search"}\n\nevent: done\ndata: {"status":"done","reply":"ok"}\n\n',
      );
    }) as unknown as typeof fetch;

    await streamOrchestratedChat({
      endpoint: 'https://app/api/chat/stream',
      token: 'jwt-123',
      request: { configurationId: 'c1', messages: [{ role: 'user', content: 'hi' }] },
      handlers: {
        onToolStarted: (e) => seen.push(`started:${e.tool}`),
        onDone: (r) => seen.push(`done:${r.reply}`),
      },
      fetchImpl,
    });

    expect(seen).toEqual(['started:search', 'done:ok']);
    expect(captured!.init.method).toBe('POST');
    expect((captured!.init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-123');
    expect(String(captured!.init.body)).toContain('c1');
  });

  it('reports HTTP errors via onError without throwing', async () => {
    let err = '';
    const fetchImpl = (async () => sseResponse('nope', 502)) as unknown as typeof fetch;
    await streamOrchestratedChat({
      endpoint: 'x',
      request: { configurationId: 'c', messages: [] },
      handlers: {
        onError: (m) => {
          err = m;
        },
      },
      fetchImpl,
    });
    expect(err).toContain('502');
  });
});
