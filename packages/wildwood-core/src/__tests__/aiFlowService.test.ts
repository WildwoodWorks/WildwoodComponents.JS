import { describe, it, expect, vi } from 'vitest';
import { AIFlowService } from '../ai/aiFlowService.js';
import type { AIFlowRunEvent } from '../ai/types.js';
import { WildwoodEventEmitter } from '../events/eventEmitter.js';
import type { WildwoodConfig } from '../client/types.js';

const config: WildwoodConfig = { baseUrl: 'https://api.test', appId: 'app-1' };

function makeService(token: string | null = 'jwt-1') {
  const events = new WildwoodEventEmitter();
  const sessionExpired = vi.fn();
  events.on('sessionExpired', sessionExpired);
  let currentToken = token;
  const service = new AIFlowService(config, events, () => currentToken);
  return { service, sessionExpired, setToken: (t: string | null) => (currentToken = t) };
}

function sseResponse(text: string) {
  return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const frame = (event: string, data: string) => `event: ${event}\ndata: ${data}\n\n`;

describe('AIFlowService', () => {
  it('parses an SSE run stream into events and a terminal result', async () => {
    const text =
      frame('run_started', '{"runId":"run-1","threadId":"th-1"}') +
      frame('node_start', '{"node":"draft"}') +
      frame('token', '{"content":"Hel"}') +
      frame('token', '{"content":"lo"}') +
      frame('usage', '{"totalTokens":42}') +
      frame('usage', '{"totalTokens":8}') +
      frame('done', '{"status":"succeeded","output":{"answer":"Hello"}}');
    const fetchImpl = vi.fn(async () => sseResponse(text));
    const { service } = makeService();

    const events: AIFlowRunEvent[] = [];
    const result = await service.runFlow('flow-1', '{"topic":"x"}', null, (e) => void events.push(e), { fetchImpl });

    // Endpoint, auth header, and requestedAppId query
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/ai/flows/flow-1/runs/stream?requestedAppId=app-1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ inputJson: '{"topic":"x"}', threadId: null }),
        headers: expect.objectContaining({ Authorization: 'Bearer jwt-1' }),
      }),
    );

    expect(events.map((e) => e.event)).toEqual([
      'run_started',
      'node_start',
      'token',
      'token',
      'usage',
      'usage',
      'done',
    ]);
    expect(result.status).toBe('succeeded');
    expect(result.runId).toBe('run-1');
    expect(result.threadId).toBe('th-1');
    expect(result.totalTokens).toBe(50); // usage frames accumulate
    expect(result.outputJson).toBe('{"answer":"Hello"}');
  });

  it('stops dispatching at the first terminal event', async () => {
    const text =
      frame('token', '{"content":"a"}') +
      frame('error', '{"message":"boom"}') +
      frame('done', '{"status":"succeeded"}') + // must NOT overwrite the failed result
      frame('token', '{"content":"late"}');
    const { service } = makeService();

    const seen: string[] = [];
    const result = await service.runFlow('f', '{}', null, (e) => void seen.push(e.event), {
      fetchImpl: async () => sseResponse(text),
    });

    expect(seen).toEqual(['token', 'error']);
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('boom');
  });

  it('dispatches a final buffered event that arrived without a trailing blank line', async () => {
    const text = frame('run_started', '{"runId":"r1"}') + 'event: done\ndata: {"status":"succeeded"}';
    const { service } = makeService();

    const result = await service.runFlow('f', '{}', null, undefined, {
      fetchImpl: async () => sseResponse(text),
    });

    expect(result.status).toBe('succeeded');
    expect(result.runId).toBe('r1');
  });

  it('tolerates malformed frames: guarded reads, stream continues', async () => {
    const text =
      frame('run_started', '{"runId":') + // truncated JSON
      frame('usage', '"not-an-object"') +
      frame('interrupt', '{"payload":{"question":"ok?"}}') +
      frame('done', '{"status":"succeeded"}');
    const { service } = makeService();

    const events: AIFlowRunEvent[] = [];
    const result = await service.runFlow('f', '{}', null, (e) => void events.push(e), {
      fetchImpl: async () => sseResponse(text),
    });

    expect(events[0]).toEqual({ event: 'run_started', data: undefined });
    expect(result.runId).toBeUndefined();
    expect(result.totalTokens).toBe(0);
    expect(result.interruptPayloadJson).toBe('{"question":"ok?"}');
    expect(result.status).toBe('succeeded');
  });

  it('maps the reject path (plain JSON response, no SSE) to a cancelled result', async () => {
    const { service } = makeService();
    const fetchImpl = vi.fn(
      async () =>
        new Response('{"status":"rejected"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const result = await service.resolveInterrupt('run-1', false, null, undefined, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/ai/flows/runs/run-1/resume?requestedAppId=app-1',
      expect.objectContaining({ body: JSON.stringify({ action: 'reject', valueJson: null }) }),
    );
    expect(result.status).toBe('cancelled');
  });

  it('on 401 with a refresh handler: refreshes and replays the stream POST once with the new token', async () => {
    const { service, sessionExpired, setToken } = makeService('jwt-old');
    const refresh = vi.fn(async () => {
      setToken('jwt-new');
      return true;
    });
    service.setOn401Refresh(refresh);

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(sseResponse(frame('done', '{"status":"succeeded"}')));

    const result = await service.runFlow('f', '{}', null, undefined, { fetchImpl });

    expect(result.status).toBe('succeeded');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // replayed exactly once
    // Replay carries the refreshed token.
    expect(fetchImpl.mock.calls[1][1].headers).toMatchObject({ Authorization: 'Bearer jwt-new' });
    expect(sessionExpired).not.toHaveBeenCalled();
  });

  it('on 401 with a refresh handler: GET helpers also refresh and replay once', async () => {
    const { service, sessionExpired } = makeService();
    const refresh = vi.fn(async () => true);
    service.setOn401Refresh(refresh);

    const flows = [{ id: 'f1', name: 'Flow', description: '', iconClass: '', inputFields: [] }];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(flows), { status: 200, headers: { 'content-type': 'application/json' } }),
      );

    expect(await service.getFlows({ fetchImpl })).toEqual(flows);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sessionExpired).not.toHaveBeenCalled();
  });

  it('falls back to the sessionExpired-once-per-token emit when refresh fails', async () => {
    const { service, sessionExpired } = makeService('jwt-1');
    const refresh = vi.fn(async () => false);
    service.setOn401Refresh(refresh);
    const unauthorized = vi.fn(async () => new Response('', { status: 401 }));

    const result = await service.runFlow('f', '{}', null, undefined, { fetchImpl: unauthorized });

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('Not authorized');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(unauthorized).toHaveBeenCalledTimes(1); // no replay without a refreshed token
    expect(sessionExpired).toHaveBeenCalledTimes(1);

    // Still once per token lifetime across subsequent 401s.
    await service.getFlows({ fetchImpl: unauthorized });
    expect(sessionExpired).toHaveBeenCalledTimes(1);
  });

  it('a throwing refresh handler is treated as "not refreshed" (sessionExpired, no replay)', async () => {
    const { service, sessionExpired } = makeService();
    service.setOn401Refresh(async () => {
      throw new Error('refresh endpoint down');
    });
    const unauthorized = vi.fn(async () => new Response('', { status: 401 }));

    const result = await service.runFlow('f', '{}', null, undefined, { fetchImpl: unauthorized });

    expect(result.status).toBe('failed');
    expect(unauthorized).toHaveBeenCalledTimes(1);
    expect(sessionExpired).toHaveBeenCalledTimes(1);
  });

  it('fires sessionExpired once per token lifetime on 401, re-arming when the token changes', async () => {
    const { service, sessionExpired, setToken } = makeService('jwt-1');
    const unauthorized = async () => new Response('', { status: 401 });

    const first = await service.runFlow('f', '{}', null, undefined, { fetchImpl: unauthorized });
    expect(first.status).toBe('failed');
    expect(first.errorMessage).toBe('Not authorized');

    await service.getFlows({ fetchImpl: unauthorized });
    expect(sessionExpired).toHaveBeenCalledTimes(1); // one-shot per token

    setToken('jwt-2'); // new token re-arms the signal
    await service.getFlows({ fetchImpl: unauthorized });
    expect(sessionExpired).toHaveBeenCalledTimes(2);
  });

  it('treats 403 as a permission denial: no sessionExpired, flow-access message', async () => {
    const { service, sessionExpired } = makeService();
    const forbidden = async () => new Response('', { status: 403 });

    const result = await service.runFlow('f', '{}', null, undefined, { fetchImpl: forbidden });

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe("You don't have access to this flow.");
    expect(sessionExpired).not.toHaveBeenCalled();
    expect(await service.getFlows({ fetchImpl: forbidden })).toEqual([]);
  });

  it('maps abort to a cancelled result and never throws', async () => {
    const { service } = makeService();
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    };

    const result = await service.runFlow('f', '{}', null, undefined, { fetchImpl, signal: controller.signal });

    expect(result.status).toBe('cancelled');
  });

  it('getFlows returns the flow list and [] on transport failure', async () => {
    const { service } = makeService();
    const flows = [{ id: 'f1', name: 'Flow', description: '', iconClass: '', inputFields: [] }];
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(flows), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    expect(await service.getFlows({ fetchImpl })).toEqual(flows);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/ai/flows?requestedAppId=app-1',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer jwt-1' }) }),
    );

    const failing = async () => {
      throw new Error('network down');
    };
    expect(await service.getFlows({ fetchImpl: failing })).toEqual([]);
  });

  it('honors apiBaseUrl and appId overrides', async () => {
    const { service } = makeService();
    const fetchImpl = vi.fn(
      async () =>
        new Response('[]', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    await service.getThreadRuns('th-9', { fetchImpl, apiBaseUrl: 'https://other.host/api/', appId: 'app-2' });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://other.host/api/ai/flows/threads/th-9/runs?requestedAppId=app-2',
      expect.anything(),
    );
  });
});
