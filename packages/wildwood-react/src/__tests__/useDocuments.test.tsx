import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { AppDocumentModel, UploadableFile } from '@wildwood/core';
import { useDocuments } from '../hooks/useDocuments.js';
import { createTestClient, createWrapper } from './testUtils.js';

const doc: AppDocumentModel = {
  id: 'doc-1',
  fileName: 'permit.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1024,
  status: 'parsed',
  parsedCharacters: 500,
  createdAt: '2026-08-01T00:00:00Z',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useDocuments upload', () => {
  it('forwards a web Blob to core unchanged', async () => {
    const client = createTestClient();
    vi.spyOn(client.documents, 'list').mockResolvedValue([]);
    const spy = vi.spyOn(client.documents, 'upload').mockResolvedValue(doc);

    const { result } = renderHook(() => useDocuments({ pollIntervalMs: 0 }), { wrapper: createWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const blob = new Blob(['pdf bytes'], { type: 'application/pdf' });
    await act(async () => {
      await result.current.upload(blob, 'permit.pdf');
    });

    expect(spy).toHaveBeenCalledWith(blob, 'permit.pdf', { apiBaseUrl: undefined, appId: undefined });
  });

  it('accepts a React Native file descriptor and forwards it to core', async () => {
    const client = createTestClient();
    vi.spyOn(client.documents, 'list').mockResolvedValue([]);
    const spy = vi.spyOn(client.documents, 'upload').mockResolvedValue(doc);

    const { result } = renderHook(() => useDocuments({ pollIntervalMs: 0 }), { wrapper: createWrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Type-level assertion too: this only compiles because upload takes UploadableFile.
    const descriptor: UploadableFile = {
      uri: 'file:///var/mobile/permit.pdf',
      name: 'permit.pdf',
      type: 'application/pdf',
    };

    let created: AppDocumentModel | null = null;
    await act(async () => {
      created = await result.current.upload(descriptor);
    });

    expect(spy).toHaveBeenCalledWith(descriptor, undefined, { apiBaseUrl: undefined, appId: undefined });
    expect(created).toEqual(doc);
    expect(result.current.error).toBeNull();
  });
});
