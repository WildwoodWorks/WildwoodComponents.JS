import { describe, it, expect, vi } from 'vitest';
import { MessagingService } from '../messaging/messagingService.js';
import type { HttpClient } from '../client/httpClient.js';

const ok = (data: unknown) => ({ data, status: 200, headers: {} });

function makeHttp() {
  return {
    get: vi.fn(async () => ok(undefined)),
    post: vi.fn(async () => ok(undefined)),
    put: vi.fn(async () => ok(undefined)),
    delete: vi.fn(async () => ok(undefined)),
  } as unknown as HttpClient & Record<'get' | 'post' | 'put' | 'delete', ReturnType<typeof vi.fn>>;
}

describe('MessagingService', () => {
  it('getThread returns null when the thread is missing', async () => {
    const http = makeHttp();
    http.get.mockRejectedValueOnce(new Error('404'));
    const svc = new MessagingService(http);

    expect(await svc.getThread('missing')).toBeNull();
  });

  it('createThread posts the thread payload and returns the created thread', async () => {
    const http = makeHttp();
    http.post.mockResolvedValueOnce(ok({ id: 'thread-1' }));
    const svc = new MessagingService(http);

    const thread = await svc.createThread('cap-1', 'Subject', ['u1', 'u2']);

    const [url, body] = http.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('api/messaging/threads');
    expect(body.companyAppId).toBe('cap-1');
    expect(body.subject).toBe('Subject');
    expect(body.participantIds).toEqual(['u1', 'u2']);
    expect(thread.id).toBe('thread-1');
  });

  it('editMessage PUTs the new content', async () => {
    const http = makeHttp();
    http.put.mockResolvedValueOnce(ok({ id: 'm1', content: 'updated' }));
    const svc = new MessagingService(http);

    await svc.editMessage('m1', 'updated');

    expect(http.put).toHaveBeenCalledWith('api/messaging/messages/m1', { content: 'updated' });
  });

  it('reactToMessage posts the emoji and returns true', async () => {
    const http = makeHttp();
    const svc = new MessagingService(http);

    const result = await svc.reactToMessage('m1', '👍');

    expect(http.post).toHaveBeenCalledWith('api/messaging/messages/m1/reactions', { emoji: '👍' });
    expect(result).toBe(true);
  });

  it('removeReaction encodes the emoji into the delete path', async () => {
    const http = makeHttp();
    const svc = new MessagingService(http);

    await svc.removeReaction('m1', '👍');

    const url = http.delete.mock.calls[0][0] as string;
    expect(url).toBe(`api/messaging/messages/m1/reactions/${encodeURIComponent('👍')}`);
  });

  it('deleteMessage returns false when the request fails', async () => {
    const http = makeHttp();
    http.delete.mockRejectedValueOnce(new Error('forbidden'));
    const svc = new MessagingService(http);

    expect(await svc.deleteMessage('m1')).toBe(false);
  });

  it('updateOnlineStatus posts status to the messaging status endpoint', async () => {
    const http = makeHttp();
    const svc = new MessagingService(http);

    // UserStatus is a string enum; cast the literal to satisfy the signature at runtime.
    await svc.updateOnlineStatus('cap-1', 'Online' as never, 'be right back');

    expect(http.post).toHaveBeenCalledWith('api/messaging/status', {
      companyAppId: 'cap-1',
      status: 'Online',
      statusMessage: 'be right back',
    });
  });
});
