import { describe, it, expect, vi } from 'vitest';
import { DocumentService } from '../documents/documentService.js';
import { WildwoodEventEmitter } from '../events/eventEmitter.js';
import type { WildwoodConfig } from '../client/types.js';

const config: WildwoodConfig = { baseUrl: 'https://api.test', appId: 'app-1', apiKey: 'pk-1' };

function makeService(token: string | null = 'jwt-1') {
  const events = new WildwoodEventEmitter();
  const sessionExpired = vi.fn();
  events.on('sessionExpired', sessionExpired);
  const service = new DocumentService(config, events, () => token);
  return { service, sessionExpired };
}

const doc = {
  id: 'doc-1',
  fileName: 'rfp.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1024,
  status: 'uploaded',
  parsedCharacters: 0,
  createdAt: '2026-07-07T00:00:00Z',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('DocumentService', () => {
  it('lists documents with auth headers and requestedAppId', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([doc]));
    const { service } = makeService();

    const documents = await service.list({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/documents?requestedAppId=app-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-1',
          'X-API-Key': 'pk-1',
        }),
      }),
    );
    expect(documents).toHaveLength(1);
    expect(documents[0].id).toBe('doc-1');
  });

  it('uploads multipart form data without a manual Content-Type', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(doc));
    const { service } = makeService();

    const created = await service.upload(new Blob(['%PDF-1.7']), 'rfp.pdf', { fetchImpl });

    expect(created.id).toBe('doc-1');
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    // The runtime must set the multipart boundary itself.
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('surfaces the server error detail on a failed upload', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'Unsupported document type.' }, 400));
    const { service } = makeService();

    await expect(service.upload(new Blob(['x']), 'x.exe', { fetchImpl })).rejects.toThrow('Unsupported document type.');
  });

  it('maps the 409 not-parsed-yet response to a text-less result', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: 'parsing', error: 'Text not available yet.' }, 409));
    const { service } = makeService();

    const result = await service.getText('doc-1', { fetchImpl });

    expect(result).toEqual({
      id: 'doc-1',
      status: 'parsing',
      characters: 0,
      text: null,
      error: 'Text not available yet.',
    });
  });

  it('returns parsed text when available', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'doc-1', status: 'parsed', characters: 5, text: 'hello' }));
    const { service } = makeService();

    const result = await service.getText('doc-1', { fetchImpl });
    expect(result?.text).toBe('hello');
    expect(result?.status).toBe('parsed');
  });

  it('fires sessionExpired once per token on 401, and never on 403', async () => {
    const unauthorized = vi.fn(async () => new Response('', { status: 401 }));
    const { service, sessionExpired } = makeService();

    await service.list({ fetchImpl: unauthorized });
    await service.list({ fetchImpl: unauthorized });
    expect(sessionExpired).toHaveBeenCalledTimes(1);

    const forbidden = vi.fn(async () => new Response('', { status: 403 }));
    const { service: service2, sessionExpired: sessionExpired2 } = makeService();
    expect(await service2.list({ fetchImpl: forbidden })).toEqual([]);
    expect(sessionExpired2).not.toHaveBeenCalled();
  });

  it('deletes and reports success', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ deleted: true }));
    const { service } = makeService();

    expect(await service.delete('doc-1', { fetchImpl })).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/documents/doc-1?requestedAppId=app-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
