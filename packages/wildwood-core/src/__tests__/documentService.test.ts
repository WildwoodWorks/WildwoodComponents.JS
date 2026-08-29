import { describe, it, expect, vi, afterEach } from 'vitest';
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

/**
 * Records the exact arguments handed to FormData.append (still calling through),
 * so the RN descriptor path can be asserted on directly — Node's FormData
 * stringifies non-Blob parts, where RN's would serialize them as a file.
 */
const formDataSpies: { mockRestore(): void }[] = [];
function captureFormDataAppends(passThrough = true): () => unknown[][] {
  const calls: unknown[][] = [];
  const original = FormData.prototype.append;
  const spy = vi.spyOn(FormData.prototype, 'append').mockImplementation(function (
    this: FormData,
    ...args: Parameters<FormData['append']>
  ) {
    calls.push(args);
    if (passThrough) original.apply(this, args);
  });
  formDataSpies.push(spy);
  return () => calls;
}

afterEach(() => {
  while (formDataSpies.length) formDataSpies.pop()?.mockRestore();
});

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

  it('keeps the File name as the default when no fileName is given', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(doc));
    const { service } = makeService();

    await service.upload(new File(['%PDF-1.7'], 'from-file.pdf', { type: 'application/pdf' }), undefined, {
      fetchImpl,
    });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const part = (init.body as FormData).get('file') as File;
    expect(part.name).toBe('from-file.pdf');
  });

  it('appends a React Native {uri,name,type} descriptor to FormData as-is', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(doc));
    const { service } = makeService();
    const descriptor = { uri: 'file:///var/mobile/rfp.pdf', name: 'rfp.pdf', type: 'application/pdf' };
    const appended = captureFormDataAppends();

    const created = await service.upload(descriptor, undefined, { fetchImpl });

    expect(created.id).toBe('doc-1');
    // RN's FormData serializes the descriptor into a file part itself, so the
    // object must reach append() untouched — and with no third `filename` arg,
    // which RN's polyfill ignores.
    expect(appended()).toEqual([['file', descriptor]]);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('overrides the descriptor name when a fileName is supplied', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(doc));
    const { service } = makeService();
    const descriptor = { uri: 'file:///tmp/a.pdf', name: 'a.pdf', type: 'application/pdf' };
    const appended = captureFormDataAppends();

    await service.upload(descriptor, 'renamed.pdf', { fetchImpl });

    expect(appended()).toEqual([['file', { uri: 'file:///tmp/a.pdf', name: 'renamed.pdf', type: 'application/pdf' }]]);
    // The caller's descriptor is not mutated.
    expect(descriptor.name).toBe('a.pdf');
  });

  it('does not throw where the File global is undefined (React Native runtimes)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(doc));
    const { service } = makeService();
    // Node's own FormData.append reaches for the File global internally, so the
    // spy does not call through here — this covers upload()'s guard only.
    const appended = captureFormDataAppends(false);
    const originalFile = globalThis.File;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).File;
    try {
      const blob = new Blob(['%PDF-1.7']);
      const created = await service.upload(blob, undefined, { fetchImpl });
      expect(created.id).toBe('doc-1');

      const descriptor = { uri: 'file:///tmp/a.pdf', name: 'a.pdf', type: 'application/pdf' };
      const rn = await service.upload(descriptor, undefined, { fetchImpl });
      expect(rn.id).toBe('doc-1');

      // Blob with no File global falls back to the "document" default name.
      expect(appended()).toEqual([
        ['file', blob, 'document'],
        ['file', descriptor],
      ]);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).File = originalFile;
    }
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
