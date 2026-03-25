// AI service - ported from WildwoodComponents.Blazor/Services/AIService.cs

import type { HttpClient } from '../client/httpClient.js';
import type {
  AIChatRequest,
  AIChatResponse,
  AIConfiguration,
  AISession,
  AISessionSummary,
  FlowDefinition,
  FlowExecution,
  FlowExecuteRequest,
} from './types.js';

export interface TTSVoice {
  id: string;
  name: string;
  previewUrl?: string;
}

export class AIService {
  constructor(private http: HttpClient) {}

  async sendMessage(request: AIChatRequest): Promise<AIChatResponse> {
    try {
      const { data } = await this.http.post<AIChatResponse>('api/ai/chat', request);
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
  async sendMessageWithFile(request: AIChatRequest, file: File | Blob, fileName?: string): Promise<AIChatResponse> {
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

    return this.sendMessage({
      ...request,
      fileBase64,
      fileMediaType,
      fileName: resolvedName,
    });
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
    const params = configurationType ? `?configurationType=${encodeURIComponent(configurationType)}` : '';
    const { data } = await this.http.get<AIConfiguration[]>(`api/ai/configurations${params}`);
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
      await this.http.put(`api/ai/sessions/${sessionId}/rename`, { sessionName: newName });
      return true;
    } catch {
      return false;
    }
  }

  // TTS
  async getTTSVoices(): Promise<TTSVoice[]> {
    try {
      const { data } = await this.http.get<TTSVoice[]>('api/ai/tts/voices');
      return data ?? [];
    } catch {
      return [];
    }
  }

  async getTTSVoicesForConfiguration(configurationId: string): Promise<TTSVoice[]> {
    try {
      const { data } = await this.http.get<TTSVoice[]>(`api/ai/tts/voices/${configurationId}`);
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
      const { data } = await this.http.post<{ audioBase64: string; contentType: string }>('api/ai/tts/synthesize', {
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

  // Flow
  async getFlowDefinitions(): Promise<FlowDefinition[]> {
    const { data } = await this.http.get<FlowDefinition[]>('api/ai/flows');
    return data ?? [];
  }

  async getFlowDefinition(flowId: string): Promise<FlowDefinition | null> {
    try {
      const { data } = await this.http.get<FlowDefinition>(`api/ai/flows/${flowId}`);
      return data ?? null;
    } catch {
      return null;
    }
  }

  async executeFlow(request: FlowExecuteRequest): Promise<FlowExecution> {
    const { data } = await this.http.post<FlowExecution>('api/ai/flows/execute', request);
    return data;
  }

  async getFlowExecution(executionId: string): Promise<FlowExecution | null> {
    try {
      const { data } = await this.http.get<FlowExecution>(`api/ai/flows/executions/${executionId}`);
      return data ?? null;
    } catch {
      return null;
    }
  }

  async getFlowExecutions(flowId?: string): Promise<FlowExecution[]> {
    const params = flowId ? `?flowDefinitionId=${encodeURIComponent(flowId)}` : '';
    const { data } = await this.http.get<FlowExecution[]>(`api/ai/flows/executions${params}`);
    return data ?? [];
  }

  async cancelFlowExecution(executionId: string): Promise<boolean> {
    try {
      await this.http.post(`api/ai/flows/executions/${executionId}/cancel`);
      return true;
    } catch {
      return false;
    }
  }
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
