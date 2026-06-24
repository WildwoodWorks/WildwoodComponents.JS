import { describe, it, expect, vi } from 'vitest';
import { AIService } from '../ai/aiService.js';
import type { HttpClient } from '../client/httpClient.js';

const ok = (data: unknown) => ({ data, status: 200, headers: {} });

function makeHttp() {
  return {
    get: vi.fn(async () => ok(undefined)),
    post: vi.fn(async () => ok(undefined)),
    put: vi.fn(async () => ok(undefined)),
    delete: vi.fn(async () => ok(undefined)),
  } as unknown as HttpClient & Record<'get' | 'post' | 'put' | 'delete', ReturnType<typeof vi.fn>>;
}

describe('AIService', () => {
  it('sendMessage posts to api/ai/chat and returns the response', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ message: 'hi', sessionId: 's1' }));
    const svc = new AIService(http);

    const res = await svc.sendMessage({ configurationId: 'c1', message: 'hello' });

    expect(http.post).toHaveBeenCalledWith('api/ai/chat', { configurationId: 'c1', message: 'hello' }, undefined);
    expect(res.message).toBe('hi');
  });

  it('sendProxyMessage routes to the api/ai/proxy alias', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ message: 'proxied' }));
    const svc = new AIService(http);

    await svc.sendProxyMessage({ configurationId: 'c1', message: 'hello' });

    expect(http.post).toHaveBeenCalledWith('api/ai/proxy', { configurationId: 'c1', message: 'hello' }, undefined);
  });

  it('getConfigurations passes configurationType and requestedAppId as query params', async () => {
    const http = makeHttp();
    http.get.mockResolvedValueOnce(ok([{ id: 'cfg-1' }]));
    const svc = new AIService(http, 'app-9');

    const res = await svc.getConfigurations('chat');

    const url = http.get.mock.calls[0][0] as string;
    expect(url).toContain('api/ai/configurations?');
    expect(url).toContain('configurationType=chat');
    expect(url).toContain('requestedAppId=app-9');
    expect(res).toHaveLength(1);
  });

  it('getConfigurations returns [] when the API yields no data', async () => {
    const http = makeHttp();
    http.get.mockResolvedValueOnce(ok(undefined));
    const svc = new AIService(http);

    expect(await svc.getConfigurations()).toEqual([]);
  });

  it('getConfiguration swallows errors and returns null', async () => {
    const http = makeHttp();
    http.get.mockRejectedValueOnce(new Error('boom'));
    const svc = new AIService(http);

    expect(await svc.getConfiguration('missing')).toBeNull();
  });

  it('createSession posts a default session name when none is supplied', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ id: 'sess-1' }));
    const svc = new AIService(http);

    const session = await svc.createSession('c1');

    expect(http.post).toHaveBeenCalledWith('api/ai/sessions', {
      configurationId: 'c1',
      sessionName: 'New Session',
    });
    expect(session?.id).toBe('sess-1');
  });

  it('renameSession PUTs the new name and reports success', async () => {
    const http = makeHttp();
    const svc = new AIService(http);

    const ok1 = await svc.renameSession('sess-1', 'Renamed');

    expect(http.put).toHaveBeenCalledWith('api/ai/sessions/sess-1/name', { newName: 'Renamed' });
    expect(ok1).toBe(true);
  });

  it('endSession returns false when the request throws', async () => {
    const http = makeHttp();
    http.post.mockRejectedValueOnce(new Error('network'));
    const svc = new AIService(http);

    expect(await svc.endSession('sess-1')).toBe(false);
  });

  it('deleteSession issues a DELETE and returns true', async () => {
    const http = makeHttp();
    const svc = new AIService(http);

    expect(await svc.deleteSession('sess-1')).toBe(true);
    expect(http.delete).toHaveBeenCalledWith('api/ai/sessions/sess-1');
  });
});
