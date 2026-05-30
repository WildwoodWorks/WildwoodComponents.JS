// Feedback service - ported from WildwoodAdmin/wwwroot/js/feedback-widget.js.
// Talks to the WildwoodAPI SystemFeedback + AppComponentConfigurations endpoints.
// Submit/vote work anonymously (no token) and authenticated (Bearer token added
// automatically by HttpClient when a token provider is configured).

import type { HttpClient } from '../client/httpClient.js';
import type {
  FeedbackWidgetConfig,
  SubmitFeedbackInput,
  SystemFeedback,
  FeedbackDuplicateCheck,
  FeedbackVoteResult,
} from './types.js';

export class FeedbackService {
  constructor(
    private http: HttpClient,
    private defaultAppId: string,
  ) {}

  /**
   * Resolve the effective appId, falling back to the client default.
   * Treats empty/whitespace as "not provided" (matches the reference widget's
   * `appId || null` semantics) so a blank prop never overrides the config or is
   * sent to the server as a literal empty string.
   */
  private resolveAppId(appId?: string | null): string {
    const provided = appId?.trim();
    if (provided) return provided;
    return this.defaultAppId?.trim() ?? '';
  }

  /**
   * Load the public widget configuration for an app (anonymous-accessible).
   * GET api/AppComponentConfigurations/{appId}/feedback/widget
   */
  async getWidgetConfig(appId?: string): Promise<FeedbackWidgetConfig> {
    const targetAppId = this.resolveAppId(appId);
    const { data } = await this.http.get<FeedbackWidgetConfig>(
      `api/AppComponentConfigurations/${encodeURIComponent(targetAppId)}/feedback/widget`,
    );
    return data;
  }

  /**
   * Submit feedback. Returns the created feedback record (HTTP 201).
   * Anonymous submissions are allowed when the app permits them; an auth token
   * is attached automatically if one is available.
   * POST api/SystemFeedback
   */
  async submitFeedback(input: SubmitFeedbackInput): Promise<SystemFeedback> {
    const { data } = await this.http.post<SystemFeedback>('api/SystemFeedback', {
      appId: this.resolveAppId(input.appId) || null,
      title: input.title,
      description: input.description,
      feedbackType: input.feedbackType,
      pageUrl: input.pageUrl ?? null,
      screenshotData: input.screenshotData ?? null,
      attachments: input.attachments ?? null,
      browserContext: input.browserContext ?? null,
      submitterEmail: input.submitterEmail ?? null,
      submitterName: input.submitterName ?? null,
    });
    return data;
  }

  /**
   * Check for a potential duplicate of a feedback title submitted in the last hour.
   * GET api/SystemFeedback/duplicate-check?title=..&appId=..
   */
  async checkDuplicate(title: string, appId?: string): Promise<FeedbackDuplicateCheck> {
    const targetAppId = this.resolveAppId(appId);
    let url = `api/SystemFeedback/duplicate-check?title=${encodeURIComponent(title)}`;
    if (targetAppId) url += `&appId=${encodeURIComponent(targetAppId)}`;
    const { data } = await this.http.get<FeedbackDuplicateCheck>(url);
    return data;
  }

  /**
   * Upvote an existing feedback item ("me too"). Works anonymously or authenticated.
   * POST api/SystemFeedback/{id}/vote
   */
  async voteFeedback(id: string): Promise<FeedbackVoteResult> {
    const { data } = await this.http.post<FeedbackVoteResult>(`api/SystemFeedback/${encodeURIComponent(id)}/vote`);
    return data;
  }
}
