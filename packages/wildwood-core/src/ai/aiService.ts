// AI service - ported from WildwoodComponents.Blazor/Services/AIService.cs

import { WildwoodError } from '../client/errors.js';
import type { HttpClient } from '../client/httpClient.js';
import type { RequestOptions } from '../client/types.js';
import type { AIChatRequest, AIChatResponse, AIConfiguration, AISession, AISessionSummary } from './types.js';

export interface TTSVoice {
  id: string;
  name: string;
  previewUrl?: string;
}

/**
 * Result of a server-side speech-to-text transcription (POST api/stt/transcribe).
 * Mirrors .NET `SpeechTranscriptionResult` (WildwoodComponents.Shared/Models/AIChatModels.cs).
 */
export interface SpeechTranscriptionResult {
  /** Whether the audio was transcribed. False on any server, provider, or network failure. */
  success: boolean;
  /** The transcribed text (empty when the clip contained no speech). */
  text: string;
  /** A user-presentable reason when `success` is false. */
  errorMessage?: string;
}

export class AIService {
  constructor(
    private http: HttpClient,
    private appId?: string,
  ) {}

  async sendMessage(request: AIChatRequest, options?: RequestOptions): Promise<AIChatResponse> {
    return this.postChat('api/ai/chat', request, options);
  }

  /**
   * Send a message via the AI proxy endpoint.
   * Routes to POST /api/ai/proxy; the backing handler is identical to /api/ai/chat,
   * but the proxy alias is the canonical endpoint for AIProxyComponent usage.
   *
   * Pass `options.timeout` (seconds) to override the default 30s request timeout for
   * long-running generations (e.g. spec/document synthesis) that would otherwise be
   * aborted and retried mid-flight.
   */
  async sendProxyMessage(request: AIChatRequest, options?: RequestOptions): Promise<AIChatResponse> {
    return this.postChat('api/ai/proxy', request, options);
  }

  private async postChat(endpoint: string, request: AIChatRequest, options?: RequestOptions): Promise<AIChatResponse> {
    try {
      const { data } = await this.http.post<AIChatResponse>(endpoint, request, options);
      return data;
    } catch (err: unknown) {
      return this.parseErrorResponse(err);
    }
  }

  /**
   * Send a message with a file attachment.
   * Converts the file to Base64 and includes it in the request body.
   * Mirrors Blazor's SendMessageWithFileAsync.
   */
  async sendMessageWithFile(
    request: AIChatRequest,
    file: File | Blob,
    fileName?: string,
    options?: RequestOptions,
  ): Promise<AIChatResponse> {
    return this.sendFileRequest(request, file, fileName, false, options);
  }

  /**
   * Send a file via the AI proxy endpoint. Mirrors WildwoodAIProxyService.SendRequestWithFileAsync.
   */
  async sendProxyMessageWithFile(
    request: AIChatRequest,
    file: File | Blob,
    fileName?: string,
    options?: RequestOptions,
  ): Promise<AIChatResponse> {
    return this.sendFileRequest(request, file, fileName, true, options);
  }

  private async sendFileRequest(
    request: AIChatRequest,
    file: File | Blob,
    fileName: string | undefined,
    viaProxy: boolean,
    options?: RequestOptions,
  ): Promise<AIChatResponse> {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    // Use chunked encoding to avoid call stack limits with large files
    const CHUNK_SIZE = 8192;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      const chunk = bytes.subarray(offset, offset + CHUNK_SIZE);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const fileBase64 = btoa(binary);

    const resolvedName = fileName ?? (file instanceof File ? file.name : 'attachment');
    const fileMediaType = file.type || getMediaTypeFromFileName(resolvedName);

    const withFile: AIChatRequest = {
      ...request,
      fileBase64,
      fileMediaType,
      fileName: resolvedName,
    };
    return viaProxy ? this.sendProxyMessage(withFile, options) : this.sendMessage(withFile, options);
  }

  /**
   * Parses a structured API error response to extract user-friendly error messages and error codes.
   * Handles the structured error JSON format: { "error": "...", "limitCode": "...", "currentUsage": N, "maxValue": N, ... }
   */
  private parseErrorResponse(err: unknown): AIChatResponse {
    const response: AIChatResponse = {
      id: '',
      response: '',
      tokensUsed: 0,
      model: '',
      providerTypeCode: '',
      createdAt: new Date().toISOString(),
      isError: true,
    };

    // Try to extract the response body from the error (WildwoodError stores it in 'details')
    const errorBody = (err as { details?: unknown })?.details ?? (err as { body?: unknown })?.body;
    const errorMessage = err instanceof Error ? err.message : String(err);

    if (errorBody && typeof errorBody === 'object') {
      const body = errorBody as Record<string, unknown>;

      // Extract error code (e.g., "AI_TOKENS", "AI_REQUESTS")
      if (typeof body.limitCode === 'string') {
        response.errorCode = body.limitCode;
      }

      // Build user-friendly message
      if (typeof body.error === 'string') {
        let message = body.error;

        // Append usage details if available
        if (typeof body.currentUsage === 'number' && typeof body.maxValue === 'number') {
          const unit = typeof body.unit === 'string' ? body.unit : 'units';
          message += ` (${body.currentUsage.toLocaleString()}/${body.maxValue.toLocaleString()} ${unit})`;
        }

        // Append period end if available
        if (typeof body.periodEnd === 'string') {
          const periodEndDate = new Date(body.periodEnd);
          if (!isNaN(periodEndDate.getTime())) {
            message += `. Resets ${periodEndDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
          }
        }

        response.errorMessage = message;
        return response;
      }

      // Fallback: try generic fields
      if (typeof body.statusMessage === 'string') {
        response.errorMessage = body.statusMessage;
        return response;
      }
      if (typeof body.message === 'string') {
        response.errorMessage = body.message;
        return response;
      }
    }

    // Final fallback
    response.errorMessage = errorMessage || 'An error occurred while sending the message';
    return response;
  }

  async getConfigurations(configurationType?: string): Promise<AIConfiguration[]> {
    const params = new URLSearchParams();
    if (configurationType) params.set('configurationType', configurationType);
    if (this.appId) params.set('requestedAppId', this.appId);
    const query = params.toString();
    const url = query ? `api/ai/configurations?${query}` : 'api/ai/configurations';
    const { data } = await this.http.get<AIConfiguration[]>(url);
    return data ?? [];
  }

  async getConfiguration(configurationId: string): Promise<AIConfiguration | null> {
    try {
      const { data } = await this.http.get<AIConfiguration>(`api/ai/configurations/${configurationId}`);
      return data ?? null;
    } catch {
      return null;
    }
  }

  async createSession(configurationId: string, sessionName?: string): Promise<AISession | null> {
    try {
      const { data } = await this.http.post<AISession>('api/ai/sessions', {
        configurationId,
        sessionName: sessionName ?? 'New Session',
      });
      return data ?? null;
    } catch {
      return null;
    }
  }

  async getSession(sessionId: string): Promise<AISession | null> {
    try {
      const { data } = await this.http.get<AISession>(`api/ai/sessions/${sessionId}`);
      return data ?? null;
    } catch {
      return null;
    }
  }

  async getSessions(configurationId?: string): Promise<AISessionSummary[]> {
    const params = configurationId ? `?configurationId=${encodeURIComponent(configurationId)}` : '';
    const { data } = await this.http.get<AISessionSummary[]>(`api/ai/sessions${params}`);
    return data ?? [];
  }

  async endSession(sessionId: string): Promise<boolean> {
    try {
      await this.http.post(`api/ai/sessions/${sessionId}/end`);
      return true;
    } catch {
      return false;
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      await this.http.delete(`api/ai/sessions/${sessionId}`);
      return true;
    } catch {
      return false;
    }
  }

  async renameSession(sessionId: string, newName: string): Promise<boolean> {
    try {
      await this.http.put(`api/ai/sessions/${sessionId}/name`, { newName });
      return true;
    } catch {
      return false;
    }
  }

  // TTS
  async getTTSVoices(): Promise<TTSVoice[]> {
    try {
      const { data } = await this.http.get<TTSVoice[]>('api/tts/voices');
      return data ?? [];
    } catch {
      return [];
    }
  }

  async getTTSVoicesForConfiguration(configurationId: string): Promise<TTSVoice[]> {
    try {
      const { data } = await this.http.get<TTSVoice[]>(`api/tts/voices/configuration/${configurationId}`);
      return data ?? [];
    } catch {
      return [];
    }
  }

  async synthesizeSpeech(
    text: string,
    voice: string,
    speed = 1.0,
    configurationId?: string,
  ): Promise<{ audioBase64: string; contentType: string } | null> {
    try {
      const { data } = await this.http.post<{ audioBase64: string; contentType: string }>('api/tts/synthesize/base64', {
        text,
        voice,
        speed,
        configurationId,
      });
      return data ?? null;
    } catch {
      return null;
    }
  }

  // Speech-to-text
  /**
   * Transcribe recorded audio to text via the server (POST api/stt/transcribe).
   *
   * Ported from Blazor's `AIService.TranscribeAudioAsync`: multipart upload with the file part
   * named `file` and a `speech.<ext>` filename, `configurationId`/`language` omitted when empty.
   * Never throws — every failure (no audio, non-2xx, network) comes back as a result whose
   * `success` is false and whose `errorMessage` is presentable to the user.
   *
   * `contentType` defaults to the blob's own type, so a `MediaRecorder` chunk can be passed
   * straight through. Codec parameters are stripped for the part's content type and the filename
   * ("audio/webm;codecs=opus" -> "audio/webm" -> "speech.webm"); the server ignores them anyway.
   */
  async transcribeAudio(
    audio: Blob,
    contentType?: string,
    configurationId?: string,
    language?: string,
  ): Promise<SpeechTranscriptionResult> {
    if (!audio || audio.size === 0) {
      return transcriptionFailure('No audio was recorded.');
    }

    try {
      const mediaType = bareMediaType(contentType ?? audio.type);
      // Re-wrapped only when the blob's own type still carries the codec parameters, so the
      // multipart part's Content-Type is the bare media type the .NET client sends.
      const filePart = mediaType && audio.type !== mediaType ? new Blob([audio], { type: mediaType }) : audio;

      const form = new FormData();
      // Upload extension per recorded format — the server's transcription provider infers the
      // container from the file name. Mirrors WildwoodAPI's STTAudioFormats.
      form.append('file', filePart, `speech${AUDIO_EXTENSION_BY_MEDIA_TYPE[mediaType] ?? ''}`);
      if (configurationId) form.append('configurationId', configurationId);
      if (language) form.append('language', language);

      // No Content-Type header here: HttpClient leaves FormData bodies alone so the runtime sets
      // multipart/form-data with the boundary itself.
      const { data, status } = await this.http.post<SpeechTranscriptionResult>('api/stt/transcribe', form);
      if (data?.success) {
        return { success: true, text: data.text ?? '' };
      }
      return transcriptionFailure(data?.errorMessage || `Transcription failed (${status}).`);
    } catch (err: unknown) {
      return transcriptionFailure(transcriptionErrorMessage(err));
    }
  }
}

/** Upload extension per recorded format, keyed by BARE media type. Mirrors the Blazor map. */
const AUDIO_EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.mp4',
  'audio/x-m4a': '.m4a',
  'audio/m4a': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
};

/** "audio/webm;codecs=opus" -> "audio/webm". Empty string for a blank input. */
function bareMediaType(contentType: string | undefined): string {
  if (!contentType || !contentType.trim()) return '';
  const separator = contentType.indexOf(';');
  return (separator >= 0 ? contentType.slice(0, separator) : contentType).trim().toLowerCase();
}

function transcriptionFailure(errorMessage: string): SpeechTranscriptionResult {
  return { success: false, text: '', errorMessage };
}

/**
 * The server answered, so prefer its own `errorMessage` and fall back to the status code —
 * the two messages Blazor reports. Anything else (network, timeout, abort) carries no server
 * message and gets the generic retry copy from Blazor's catch-all.
 */
function transcriptionErrorMessage(err: unknown): string {
  if (err instanceof WildwoodError && err.status > 0) {
    const body = err.details;
    if (body && typeof body === 'object') {
      const fromBody = (body as { errorMessage?: unknown }).errorMessage;
      if (typeof fromBody === 'string' && fromBody) return fromBody;
    }
    return `Transcription failed (${err.status}).`;
  }
  return 'Transcription failed. Please try again.';
}

/** Infer MIME type from file extension when File.type is unavailable */
function getMediaTypeFromFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    pdf: 'application/pdf',
    txt: 'text/plain',
    csv: 'text/csv',
    html: 'text/html',
    htm: 'text/html',
    json: 'application/json',
    xml: 'application/xml',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    mp4: 'video/mp4',
    zip: 'application/zip',
  };
  return map[ext] ?? 'application/octet-stream';
}
