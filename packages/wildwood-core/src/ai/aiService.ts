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
    const { data } = await this.http.post<AIChatResponse>('api/ai/chat', request);
    return data;
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
      const { data } = await this.http.post<{ audioBase64: string; contentType: string }>(
        'api/ai/tts/synthesize',
        { text, voice, speed, configurationId },
      );
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
}
