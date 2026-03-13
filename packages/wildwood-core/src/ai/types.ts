// AI types - ported from WildwoodComponents.Blazor/Models/ComponentModels.cs

export interface AIMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  tokenCount: number;
  isError: boolean;
  sessionId?: string;
  messageOrder: number;
  parentMessageId?: string;
  isEdited: boolean;
  editedAt?: string;
}

export interface AISession {
  id: string;
  sessionName: string;
  messages: AIMessage[];
  createdAt: string;
  endedAt?: string;
  isActive: boolean;
  userId?: string;
  aIConfigurationId?: string;
  lastAccessedAt: string;
  messageCount: number;
  lastMessagePreview?: string;
}

export interface AISessionSummary {
  id: string;
  sessionName: string;
  messageCount: number;
  createdAt: string;
  lastAccessedAt: string;
  endedAt?: string;
  isActive: boolean;
  lastMessagePreview?: string;
}

export interface AIConfiguration {
  id: string;
  name: string;
  description: string;
  model: string;
  providerType: string;
  isActive: boolean;
  persistentSessionEnabled: boolean;
  configurationType: string;
  enableTTS: boolean;
  ttsModel?: string;
  ttsDefaultVoice?: string;
  ttsDefaultSpeed: number;
  ttsDefaultFormat: string;
  ttsEnabledVoicesJson?: string;
}

export interface AIChatRequest {
  configurationId: string;
  sessionId?: string;
  message: string;
  saveToSession?: boolean;
  macroValues?: Record<string, string>;
}

export interface AIChatResponse {
  id: string;
  sessionId?: string;
  response: string;
  tokensUsed: number;
  model: string;
  providerType: string;
  createdAt: string;
  isError: boolean;
  errorMessage?: string;
  /** Structured error code from usage limit errors (e.g. "AI_TOKENS", "AI_REQUESTS") */
  errorCode?: string;
}

export interface AIChatSettings {
  apiBaseUrl: string;
  enableSessions: boolean;
  autoLoadRecentSession: boolean;
  showTokenUsage: boolean;
  autoScroll: boolean;
  enableFileUpload: boolean;
  enableVoiceInput: boolean;
  enableSpeechToText: boolean;
  enableTextToSpeech: boolean;
  useServerTTS: boolean;
  ttsVoice?: string;
  ttsSpeed: number;
  showDebugInfo: boolean;
  showConfigurationName: boolean;
  showConfigurationSelector: boolean;
  placeholderText: string;
  welcomeMessage: string;
  maxHistorySize: number;
  maxMessageLength: number;
}

export interface ChatTypingIndicator {
  isVisible: boolean;
  text: string;
  startedAt: string;
}

export interface FlowDefinition {
  id: string;
  name: string;
  description?: string;
  version: number;
  isActive: boolean;
  inputFields: FlowInputField[];
  createdAt: string;
  updatedAt?: string;
}

export interface FlowInputField {
  name: string;
  displayName: string;
  description?: string;
  fieldType: string;
  isRequired: boolean;
  defaultValue?: string;
  options?: string[];
  validationPattern?: string;
  validationMessage?: string;
  displayOrder: number;
}

export interface FlowExecution {
  id: string;
  flowDefinitionId: string;
  flowName: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  inputValues: Record<string, string>;
  outputValues: Record<string, string>;
  currentStepIndex: number;
  totalSteps: number;
  steps: FlowStepExecution[];
  errorMessage?: string;
}

export interface FlowStepExecution {
  stepIndex: number;
  stepName: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  output?: string;
  errorMessage?: string;
}

export interface FlowExecuteRequest {
  flowDefinitionId: string;
  inputValues: Record<string, string>;
}
