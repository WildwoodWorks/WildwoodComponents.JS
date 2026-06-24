import { describe, it, expect, vi } from 'vitest';
import { FeedbackService } from '../feedback/feedbackService.js';
import type { HttpClient } from '../client/httpClient.js';

const ok = (data: unknown) => ({ data, status: 200, headers: {} });

function makeHttp() {
  return {
    get: vi.fn(async () => ok(undefined)),
    post: vi.fn(async () => ok(undefined)),
  } as unknown as HttpClient & Record<'get' | 'post', ReturnType<typeof vi.fn>>;
}

describe('FeedbackService', () => {
  it('getWidgetConfig encodes the resolved appId into the path', async () => {
    const http = makeHttp();
    http.get.mockResolvedValueOnce(ok({ enabled: true }));
    const svc = new FeedbackService(http, 'app 1');

    await svc.getWidgetConfig();

    expect(http.get).toHaveBeenCalledWith('api/AppComponentConfigurations/app%201/feedback/widget');
  });

  it('submitFeedback sends a normalized payload and returns the created record', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ id: 'fb-1' }));
    const svc = new FeedbackService(http, 'default-app');

    const res = await svc.submitFeedback({ title: 'Bug', description: 'It broke', feedbackType: 'Bug' });

    const [url, body] = http.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('api/SystemFeedback');
    expect(body.appId).toBe('default-app');
    expect(body.title).toBe('Bug');
    // Optional fields are normalized to null rather than omitted.
    expect(body.pageUrl).toBeNull();
    expect(body.screenshotData).toBeNull();
    expect(res.id).toBe('fb-1');
  });

  it('submitFeedback treats a blank appId as "use the default"', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ id: 'fb-2' }));
    const svc = new FeedbackService(http, 'default-app');

    await svc.submitFeedback({ appId: '   ', title: 'x', description: 'y', feedbackType: 'Idea' });

    const body = http.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body.appId).toBe('default-app');
  });

  it('checkDuplicate only appends appId when one resolves', async () => {
    const http = makeHttp();
    http.get.mockResolvedValue(ok({ isDuplicate: false }));
    const svc = new FeedbackService(http, '');

    await svc.checkDuplicate('My title');

    const url = http.get.mock.calls[0][0] as string;
    expect(url).toContain('api/SystemFeedback/duplicate-check?title=My%20title');
    expect(url).not.toContain('appId=');
  });

  it('voteFeedback posts to the encoded vote endpoint', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ voteCount: 5 }));
    const svc = new FeedbackService(http, 'default-app');

    await svc.voteFeedback('id/with/slashes');

    expect(http.post).toHaveBeenCalledWith('api/SystemFeedback/id%2Fwith%2Fslashes/vote');
  });
});
