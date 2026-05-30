// Feedback types - ported from WildwoodAdmin/wwwroot/js/feedback-widget.js
// and WildwoodAPI SystemFeedback DTOs (DTOs/SystemFeedbackDtos.cs).

/**
 * Public widget configuration for the feedback component.
 * Mirrors WildwoodAPI SystemFeedbackWidgetConfigDto (camelCase over the wire).
 */
export interface FeedbackWidgetConfig {
  /** Whether the feedback widget is enabled for this app. */
  isEnabled: boolean;
  /** Whether anonymous (unauthenticated) users may submit feedback. */
  allowAnonymous: boolean;
  /** Feedback type codes to offer in the type dropdown (e.g. "Bug", "FeatureRequest"). */
  feedbackTypes: string[];
  /** Accent color for the widget button (hex). */
  widgetColor?: string;
  /** Position of the floating button: 'bottom-right' (default) or 'bottom-left'. */
  widgetPosition: string;
  /** Whether a screenshot is required before submitting. */
  requireScreenshot: boolean;
  /** Max screenshot size in KB before compression kicks in. */
  screenshotMaxSizeKb: number;
  /** JPEG quality (0-100) for screenshot compression. */
  screenshotQuality: number;
  /** Whether to check for similar recent feedback while typing the title. */
  enableDuplicateDetection: boolean;
  /** Whether file attachments are allowed. */
  allowAttachments: boolean;
  /** Max size per attachment in KB. */
  maxAttachmentSizeKb: number;
  /** Comma-separated list of allowed attachment extensions (e.g. ".png,.log"). */
  allowedAttachmentTypes: string;
}

/** A single attachment captured client-side and sent with feedback. */
export interface FeedbackAttachment {
  name: string;
  contentType: string;
  size: number;
  /** Base64 data URL of the file contents. */
  data: string;
}

/** A captured console/error entry included in the browser context. */
export interface FeedbackConsoleEntry {
  level: string;
  message: string;
  timestamp: string;
}

/** Diagnostic browser context collected at submission time. */
export interface FeedbackBrowserContext {
  consoleLog: FeedbackConsoleEntry[];
  environment: {
    viewportWidth: number;
    viewportHeight: number;
    screenWidth?: number;
    screenHeight?: number;
    devicePixelRatio: number;
    platform?: string;
    language?: string;
    languages?: string[];
    cookiesEnabled?: boolean;
    online?: boolean;
    colorScheme?: string;
    touchSupport?: boolean;
    timezone?: string;
  };
  performance?: {
    pageLoadMs?: number;
    domContentLoadedMs?: number;
    firstPaintMs?: number | null;
    jsHeapUsedMB?: number;
    jsHeapTotalMB?: number;
  };
}

/**
 * Input for submitting feedback.
 * Mirrors WildwoodAPI CreateSystemFeedbackDto.
 */
export interface SubmitFeedbackInput {
  /** Target app. Optional for authenticated users (app_id claim wins server-side). */
  appId?: string | null;
  /** Short title/summary (required, max 200 chars server-side). */
  title: string;
  /** Detailed description (required). */
  description: string;
  /** Feedback type code (e.g. "Bug", "FeatureRequest"). */
  feedbackType: string;
  /** URL of the page the feedback was submitted from. */
  pageUrl?: string | null;
  /** Base64 data URL of an optional screenshot. */
  screenshotData?: string | null;
  /** JSON string of FeedbackAttachment[] (matches the server contract). */
  attachments?: string | null;
  /** JSON string of FeedbackBrowserContext (matches the server contract). */
  browserContext?: string | null;
  /** Email of an anonymous submitter (ignored for authenticated users). */
  submitterEmail?: string | null;
  /** Name of an anonymous submitter (ignored for authenticated users). */
  submitterName?: string | null;
}

/**
 * Feedback record returned from a successful submit.
 * Mirrors WildwoodAPI SystemFeedbackDto.
 */
export interface SystemFeedback {
  id: string;
  companyId: string;
  appId?: string | null;
  userId?: string | null;
  userName?: string | null;
  title: string;
  description: string;
  feedbackType: string;
  status: string;
  priority?: string | null;
  pageUrl?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  submitterEmail?: string | null;
  submitterName?: string | null;
  screenshotData?: string | null;
  attachments?: string | null;
  browserContext?: string | null;
  adminNotes?: string | null;
  resolutionNotes?: string | null;
  linkedCommitSha?: string | null;
  linkedBranch?: string | null;
  voteCount: number;
  mergedIntoId?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolvedByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Result of a duplicate-title check.
 * Mirrors WildwoodAPI SystemFeedbackDuplicateCheckDto.
 */
export interface FeedbackDuplicateCheck {
  hasPotentialDuplicate: boolean;
  duplicateTitle?: string | null;
  duplicateId?: string | null;
  duplicateVoteCount: number;
  duplicateCreatedAt?: string | null;
}

/** Result of an upvote. Mirrors the `{ voteCount }` payload from the vote endpoint. */
export interface FeedbackVoteResult {
  voteCount: number;
}
