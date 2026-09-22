import { describe, it, expect, vi } from 'vitest';
import { AIService } from '../ai/aiService.js';
import { WildwoodError } from '../client/errors.js';
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

// Ported from Blazor's AIService.TranscribeAudioAsync — the multipart shape is the contract the
// server's STT endpoint reads, and the method must never throw (the recorder UI shows the result).
describe('AIService.transcribeAudio', () => {
  const clip = (type = 'audio/webm;codecs=opus', bytes = 'RIFFfake') => new Blob([bytes], { type });

  /** The FormData handed to the single POST. */
  function sentForm(http: ReturnType<typeof makeHttp>): FormData {
    expect(http.post).toHaveBeenCalledTimes(1);
    const [path, body] = http.post.mock.calls[0] as [string, unknown];
    expect(path).toBe('api/stt/transcribe');
    expect(body).toBeInstanceOf(FormData);
    return body as FormData;
  }

  it('posts multipart form data to api/stt/transcribe', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ success: true, text: 'hello there' }));
    const svc = new AIService(http);

    const res = await svc.transcribeAudio(clip(), 'audio/webm;codecs=opus', 'cfg-1', 'en-US');

    const form = sentForm(http);
    expect([...form.keys()].sort()).toEqual(['configurationId', 'file', 'language']);
    expect(form.get('configurationId')).toBe('cfg-1');
    expect(form.get('language')).toBe('en-US');
    expect(res).toEqual({ success: true, text: 'hello there' });
  });

  it('names the file part "file" with a speech.<ext> filename and the BARE media type', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ success: true, text: '' }));
    const svc = new AIService(http);

    await svc.transcribeAudio(clip(), 'audio/webm;codecs=opus');

    const part = sentForm(http).get('file') as File;
    expect(part.name).toBe('speech.webm');
    // "audio/webm;codecs=opus" → "audio/webm": the codec parameters are stripped off the part.
    expect(part.type).toBe('audio/webm');
  });

  it.each([
    ['audio/webm', 'speech.webm'],
    ['audio/ogg;codecs=opus', 'speech.ogg'],
    ['audio/mp4', 'speech.mp4'],
    ['audio/x-m4a', 'speech.m4a'],
    ['audio/m4a', 'speech.m4a'],
    ['audio/mpeg', 'speech.mp3'],
    ['audio/mp3', 'speech.mp3'],
    ['audio/wav', 'speech.wav'],
    ['audio/x-wav', 'speech.wav'],
    ['audio/wave', 'speech.wav'],
    ['audio/aiff', 'speech'],
  ])('maps %s to the filename %s', async (contentType, fileName) => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ success: true, text: '' }));
    const svc = new AIService(http);

    await svc.transcribeAudio(clip(contentType), contentType);

    expect((sentForm(http).get('file') as File).name).toBe(fileName);
  });

  it("falls back to the blob's own type when no contentType is passed", async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ success: true, text: '' }));
    const svc = new AIService(http);

    await svc.transcribeAudio(clip('audio/ogg;codecs=opus'));

    const part = sentForm(http).get('file') as File;
    expect(part.name).toBe('speech.ogg');
    expect(part.type).toBe('audio/ogg');
  });

  it('omits configurationId and language when they are empty or absent', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ success: true, text: '' }));
    const svc = new AIService(http);

    await svc.transcribeAudio(clip(), 'audio/webm', '', '');

    const form = sentForm(http);
    expect(form.has('configurationId')).toBe(false);
    expect(form.has('language')).toBe(false);
    expect([...form.keys()]).toEqual(['file']);
  });

  it('reports "No audio was recorded." without calling the server for an empty clip', async () => {
    const http = makeHttp();
    const svc = new AIService(http);

    const res = await svc.transcribeAudio(new Blob([], { type: 'audio/webm' }), 'audio/webm');

    expect(res).toEqual({ success: false, text: '', errorMessage: 'No audio was recorded.' });
    expect(http.post).not.toHaveBeenCalled();
  });

  it("never throws on a non-2xx: uses the server's errorMessage when it sent one", async () => {
    const http = makeHttp();
    http.post.mockRejectedValueOnce(
      new WildwoodError('Request failed', 400, undefined, { errorMessage: 'Audio format not supported.' }),
    );
    const svc = new AIService(http);

    const res = await svc.transcribeAudio(clip(), 'audio/webm');

    expect(res).toEqual({ success: false, text: '', errorMessage: 'Audio format not supported.' });
  });

  it('never throws on a non-2xx with no server message: falls back to the status code', async () => {
    const http = makeHttp();
    // A 413 from the web server, whose body is HTML rather than the result JSON.
    http.post.mockRejectedValueOnce(new WildwoodError('Payload Too Large', 413, undefined, '<html/>'));
    const svc = new AIService(http);

    expect(await svc.transcribeAudio(clip(), 'audio/webm')).toEqual({
      success: false,
      text: '',
      errorMessage: 'Transcription failed (413).',
    });
  });

  it('never throws on a network error', async () => {
    const http = makeHttp();
    http.post.mockRejectedValueOnce(new WildwoodError('fetch failed', 0, 'NetworkError'));
    const svc = new AIService(http);

    expect(await svc.transcribeAudio(clip(), 'audio/webm')).toEqual({
      success: false,
      text: '',
      errorMessage: 'Transcription failed. Please try again.',
    });
  });

  it('never throws when the transport rejects with a plain Error', async () => {
    const http = makeHttp();
    http.post.mockRejectedValueOnce(new Error('boom'));
    const svc = new AIService(http);

    expect(await svc.transcribeAudio(clip(), 'audio/webm')).toEqual({
      success: false,
      text: '',
      errorMessage: 'Transcription failed. Please try again.',
    });
  });

  it('treats a 200 carrying success:false as a failure and keeps the server message', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ success: false, errorMessage: 'No speech detected.' }));
    const svc = new AIService(http);

    expect(await svc.transcribeAudio(clip(), 'audio/webm')).toEqual({
      success: false,
      text: '',
      errorMessage: 'No speech detected.',
    });
  });

  it('reports the status when a 2xx body is unusable', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok(undefined));
    const svc = new AIService(http);

    expect(await svc.transcribeAudio(clip(), 'audio/webm')).toEqual({
      success: false,
      text: '',
      errorMessage: 'Transcription failed (200).',
    });
  });

  it('normalizes a successful response with no text to an empty string', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ success: true }));
    const svc = new AIService(http);

    expect(await svc.transcribeAudio(clip(), 'audio/webm')).toEqual({ success: true, text: '' });
  });
});
