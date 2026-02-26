import { CHAT_LIMITS } from '@/lib/config';
import { jsonError } from '@/lib/http';
import { createSseResponse } from '@/lib/sse';
import { chatStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    return jsonError('Missing sessionId.', 400);
  }

  const user = await chatStore.getUser(sessionId);
  if (!user) {
    return jsonError('Session not found.', 404);
  }

  return createSseResponse(request, (send, close) => {
    let closed = false;
    let lastStatus = user.status;

    send('status', { status: lastStatus });

    const pollStatus = async () => {
      if (closed) {
        return;
      }

      const latest = await chatStore.getUser(sessionId);
      if (!latest) {
        send('gone', { reason: 'missing-session' });
        close();
        return;
      }

      if (latest.status !== lastStatus) {
        lastStatus = latest.status;
        send('status', { status: latest.status });
      }
    };

    const keepAlive = setInterval(() => {
      send('ping', { t: Date.now() });
    }, CHAT_LIMITS.sseKeepAliveMs);

    const pollTimer = setInterval(() => {
      void pollStatus();
    }, 1200);

    return () => {
      closed = true;
      clearInterval(keepAlive);
      clearInterval(pollTimer);
    };
  });
}
