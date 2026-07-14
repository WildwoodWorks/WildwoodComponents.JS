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
  providerTypeCode: string;
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
  /** Base64-encoded file data for file attachments */
  fileBase64?: string;
  /** MIME type of the attached file (e.g. 'image/png', 'application/pdf') */
  fileMediaType?: string;
  /** Original filename of the attachment */
  fileName?: string;
}

export interface AIChatResponse {
  id: string;
  sessionId?: string;
  response: string;
  tokensUsed: number;
  model: string;
  providerTypeCode: string;
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

// AI Flows (LangGraph) types - ported from WildwoodComponents.Shared/Models/AIFlowModels.cs

/** A published AI Flow (LangGraph) runnable by an app user. */
export interface AIFlowModel {
  id: string;
  name: string;
  description: string;
  iconClass: string;
  /** State channels the run can be seeded with (drives the input form). */
  inputFields: AIFlowInputField[];
}

/** A state channel the run can be seeded with. */
export interface AIFlowInputField {
  name: string;
  reducer: string;
}

/** One SSE frame from a flow run stream. */
export interface AIFlowRunEvent {
  /** run_started | node_start | node_end | token | usage | interrupt | done | error */
  event: string;
  /** Parsed event JSON payload; undefined when the frame was empty or unparseable. */
  data?: unknown;
}

/** Terminal outcome of a flow run, surfaced to the component. */
export interface AIFlowRunResult {
  /** 'succeeded' | 'failed' | 'cancelled' | 'interrupted' ('unknown' until a terminal event arrives). */
  status: string;
  outputJson?: string;
  errorMessage?: string;
  totalTokens: number;
  /** Set when the run paused for human review; the payload to display. */
  interruptPayloadJson?: string;
  /** Run id (for resume/history). Populated once the run row is known. */
  runId?: string;
  threadId?: string;
}

export interface AIFlowRunSummary {
  id: string;
  flowId: string;
  threadId: string;
  triggerType: string;
  status: string;
  createdAt: string;
  durationMs?: number;
  totalTokens: number;
  errorMessage?: string;
}

/**
 * Full run detail — includes the input/output, so a client can sync the result
 * of a background/subscription run it did not stream.
 */
export interface AIFlowRunDetail extends AIFlowRunSummary {
  inputJson?: string;
  outputJson?: string;
}

/**
 * A user's standing order for a scheduled run of a published flow (the server's
 * AppLangFlowSubscription): saved inputs + cron schedule + notify-on-complete.
 */
export interface AIFlowSubscription {
  id: string;
  flowId: string;
  flowName: string;
  name: string;
  inputJson?: string;
  scheduleCron?: string;
  scheduleTimezone?: string;
  nextRunAt?: string;
  isEnabled: boolean;
  notifyOnComplete: boolean;
  lastRunId?: string;
  lastRunAt?: string;
  lastRunStatus?: string;
  createdAt: string;
}

export interface AIFlowSubscriptionCreateRequest {
  flowId: string;
  name: string;
  inputJson?: string;
  scheduleCron: string;
  scheduleTimezone?: string;
  /** Defaults to true server-side when omitted. */
  notifyOnComplete?: boolean;
}

/** All fields optional — an omitted field leaves the current value unchanged. */
export interface AIFlowSubscriptionUpdateRequest {
  name?: string;
  inputJson?: string;
  scheduleCron?: string;
  scheduleTimezone?: string;
  notifyOnComplete?: boolean;
}
