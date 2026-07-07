// Tenant document service — client for WildwoodAPI's api/documents surface
// (upload, list, metadata, download, extracted text, delete).
//
// Same transport idiom as AIFlowService: raw fetch with explicit auth headers
// (uploads are multipart FormData, which the shared HttpClient's JSON defaults
// don't cover), per-call apiBaseUrl/appId overrides, and one-shot 401
// sessionExpired signaling. Documents are tenant-scoped server-side via the
// caller's company_client_id claim.

import type { WildwoodConfig } from '../client/types.js';
import type { WildwoodEventEmitter } from '../events/eventEmitter.js';
import type { AppDocumentModel, AppDocumentTextResult } from './types.js';

export interface DocumentRequestOptions {
  /** Override the API base INCLUDING the /api segment (e.g. "https://host/api"). Defaults to config.baseUrl + "/api". */
  apiBaseUrl?: string;
  /** Override the app whose documents are targeted (sent as ?requestedAppId=). Defaults to config.appId. */
  appId?: string;
  signal?: AbortSignal;
  /** Injectable for testing. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export class DocumentService {
  /** Token the one-shot 401 signal last fired for; re-armed when the token changes. */
  private lastAuthFailureToken: string | undefined;

  constructor(
    private config: WildwoodConfig,
    private events: WildwoodEventEmitter,
    private getAccessToken: () => string | null,
  ) {}

  async list(options?: DocumentRequestOptions): Promise<AppDocumentModel[]> {
    try {
      const response = await this.fetch(options)(`${this.url('', options)}`, {
        headers: this.buildHeaders({ Accept: 'application/json' }),
        signal: options?.signal,
      });
      if (!this.ensureAuthorized(response.status) || !response.ok) return [];
      return ((await response.json()) as AppDocumentModel[]) ?? [];
    } catch (err) {
      console.warn('[DocumentService] Failed to list documents:', err);
      return [];
    }
  }

  /**
   * Uploads one file as multipart form data. Returns the created document
   * (status "uploaded"; text extraction runs server-side) or null on failure —
   * with the server's error detail in the thrown Error when it responded.
   */
  async upload(file: Blob, fileName?: string, options?: DocumentRequestOptions): Promise<AppDocumentModel> {
    const form = new FormData();
    const name = fileName ?? (file instanceof File ? file.name : 'document');
    form.append('file', file, name);

    const response = await this.fetch(options)(`${this.url('', options)}`, {
      method: 'POST',
      // No Content-Type: the runtime sets the multipart boundary itself.
      headers: this.buildHeaders({}),
      body: form,
      signal: options?.signal,
    });
    if (!this.ensureAuthorized(response.status)) {
      throw new Error(response.status === 403 ? "You don't have access to document storage." : 'Not authorized');
    }
    if (!response.ok) {
      throw new Error(await this.errorDetail(response));
    }
    return (await response.json()) as AppDocumentModel;
  }

  async get(documentId: string, options?: DocumentRequestOptions): Promise<AppDocumentModel | null> {
    try {
      const response = await this.fetch(options)(this.url(`/${encodeURIComponent(documentId)}`, options), {
        headers: this.buildHeaders({ Accept: 'application/json' }),
        signal: options?.signal,
      });
      if (!this.ensureAuthorized(response.status) || !response.ok) return null;
      return (await response.json()) as AppDocumentModel;
    } catch (err) {
      console.warn('[DocumentService] Failed to load document:', err);
      return null;
    }
  }

  /**
   * Extracted text. While parsing is pending/running (or failed) the server
   * responds 409 — mapped here to a result with `text: null` plus the status
   * and error detail, so callers can poll without special-casing.
   */
  async getText(documentId: string, options?: DocumentRequestOptions): Promise<AppDocumentTextResult | null> {
    try {
      const response = await this.fetch(options)(this.url(`/${encodeURIComponent(documentId)}/text`, options), {
        headers: this.buildHeaders({ Accept: 'application/json' }),
        signal: options?.signal,
      });
      if (!this.ensureAuthorized(response.status)) return null;
      if (response.status === 409) {
        const body = (await response.json().catch(() => ({}))) as { status?: string; error?: string };
        return {
          id: documentId,
          status: body.status ?? 'parsing',
          characters: 0,
          text: null,
          error: body.error ?? null,
        };
      }
      if (!response.ok) return null;
      return (await response.json()) as AppDocumentTextResult;
    } catch (err) {
      console.warn('[DocumentService] Failed to load document text:', err);
      return null;
    }
  }

  /** Original file bytes, or null when unavailable. */
  async download(documentId: string, options?: DocumentRequestOptions): Promise<Blob | null> {
    try {
      const response = await this.fetch(options)(this.url(`/${encodeURIComponent(documentId)}/download`, options), {
        headers: this.buildHeaders({}),
        signal: options?.signal,
      });
      if (!this.ensureAuthorized(response.status) || !response.ok) return null;
      return await response.blob();
    } catch (err) {
      console.warn('[DocumentService] Failed to download document:', err);
      return null;
    }
  }

  async delete(documentId: string, options?: DocumentRequestOptions): Promise<boolean> {
    try {
      const response = await this.fetch(options)(this.url(`/${encodeURIComponent(documentId)}`, options), {
        method: 'DELETE',
        headers: this.buildHeaders({}),
        signal: options?.signal,
      });
      if (!this.ensureAuthorized(response.status)) return false;
      return response.ok;
    } catch (err) {
      console.warn('[DocumentService] Failed to delete document:', err);
      return false;
    }
  }

  // ------------------------------------------------------------------

  private async errorDetail(response: Response): Promise<string> {
    const fallback = `Upload failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      return body?.error || fallback;
    } catch {
      return fallback;
    }
  }

  private ensureAuthorized(status: number): boolean {
    // 401 = authentication failure (one-shot sessionExpired per token);
    // 403 = permission/feature denial (e.g. tier lacks DOCUMENTS) — the token
    // is valid, so no session-expiry signal.
    if (status === 401) {
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

  private fetch(options?: DocumentRequestOptions): typeof fetch {
    return options?.fetchImpl ?? globalThis.fetch;
  }

  private url(path: string, options?: DocumentRequestOptions): string {
    const base = options?.apiBaseUrl
      ? options.apiBaseUrl.replace(/\/+$/, '')
      : `${this.config.baseUrl.replace(/\/+$/, '')}/api`;
    const appId = options?.appId ?? this.config.appId;
    const query = appId ? `?requestedAppId=${encodeURIComponent(appId)}` : '';
    return `${base}/documents${path}${query}`;
  }
}
