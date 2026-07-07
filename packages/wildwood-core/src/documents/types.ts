// Tenant document service models — mirrors WildwoodAPI AppDocumentsController DTOs.

export type AppDocumentStatus = 'uploaded' | 'parsing' | 'parsed' | 'failed';

export interface AppDocumentModel {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: AppDocumentStatus | string;
  parseError?: string | null;
  pageCount?: number | null;
  parsedCharacters: number;
  companyClientId?: string | null;
  createdAt: string;
  parsedAt?: string | null;
}

/** Result of GET /documents/{id}/text. `text` is null until parsing succeeds. */
export interface AppDocumentTextResult {
  id: string;
  status: AppDocumentStatus | string;
  characters: number;
  text: string | null;
  /** Parse error / not-ready detail when text is unavailable. */
  error?: string | null;
}
