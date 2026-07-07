'use client';

// Tenant document management state for web + native UIs: list, upload, delete,
// text retrieval — with automatic polling while any document is still parsing
// (text extraction runs server-side on a background worker).

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppDocumentModel, AppDocumentTextResult } from '@wildwood/core';
import { useWildwood } from './useWildwood.js';

export interface UseDocumentsOptions {
  /** Override the API base INCLUDING the /api segment. Defaults to the client config. */
  apiBaseUrl?: string;
  /** Override the app whose documents are targeted. Defaults to the client config appId. */
  appId?: string;
  /** Poll interval (ms) while any document is uploaded/parsing. 0 disables polling. Default 3000. */
  pollIntervalMs?: number;
}

export interface UseDocumentsReturn {
  documents: AppDocumentModel[];
  loading: boolean;
  /** True while an upload request is in flight. */
  uploading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Uploads and refreshes; returns the created document or null on failure (error is set). */
  upload: (file: Blob, fileName?: string) => Promise<AppDocumentModel | null>;
  remove: (documentId: string) => Promise<boolean>;
  /** Extracted text (text null while parsing / after failure — check status/error). */
  getText: (documentId: string) => Promise<AppDocumentTextResult | null>;
}

const PARSING_STATUSES = new Set(['uploaded', 'parsing']);

export function useDocuments(options?: UseDocumentsOptions): UseDocumentsReturn {
  const client = useWildwood();
  const { apiBaseUrl, appId } = options ?? {};
  const pollIntervalMs = options?.pollIntervalMs ?? 3000;

  const [documents, setDocuments] = useState<AppDocumentModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disposedRef = useRef(false);

  const requestOptions = useCallback(() => ({ apiBaseUrl, appId }), [apiBaseUrl, appId]);

  const refresh = useCallback(async () => {
    const list = await client.documents.list(requestOptions());
    if (!disposedRef.current) {
      setDocuments(list);
      setLoading(false);
    }
  }, [client, requestOptions]);

  useEffect(() => {
    disposedRef.current = false;
    setLoading(true);
    void refresh();
    return () => {
      disposedRef.current = true;
    };
  }, [refresh]);

  // Poll while anything is still parsing so statuses settle without manual refresh.
  useEffect(() => {
    if (pollIntervalMs <= 0) return;
    if (!documents.some((d) => PARSING_STATUSES.has(d.status))) return;
    const timer = setInterval(() => void refresh(), pollIntervalMs);
    return () => clearInterval(timer);
  }, [documents, pollIntervalMs, refresh]);

  const upload = useCallback(
    async (file: Blob, fileName?: string): Promise<AppDocumentModel | null> => {
      setUploading(true);
      setError(null);
      try {
        const created = await client.documents.upload(file, fileName, requestOptions());
        await refresh();
        return created;
      } catch (err) {
        if (!disposedRef.current) setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        if (!disposedRef.current) setUploading(false);
      }
    },
    [client, requestOptions, refresh],
  );

  const remove = useCallback(
    async (documentId: string): Promise<boolean> => {
      const deleted = await client.documents.delete(documentId, requestOptions());
      if (deleted) await refresh();
      return deleted;
    },
    [client, requestOptions, refresh],
  );

  const getText = useCallback(
    (documentId: string) => client.documents.getText(documentId, requestOptions()),
    [client, requestOptions],
  );

  return { documents, loading, uploading, error, refresh, upload, remove, getText };
}
