import { isAdminAuthorized } from '@/lib/adminAuth';
import { CHAT_LIMITS } from '@/lib/config';
import { jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';
import { createSseResponse } from '@/lib/sse';
import { chatStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  if (!isAdminAuthorized(request)) {
    return jsonError('Unauthorized.', 401);
  }

  const loadSnapshot = async () => {
    const [legacySnapshot, blacklist, ipBlacklist, ipAbuseFlags] = await Promise.all([
      chatStore.getAdminSnapshot(),
      socialStore.listBlacklistEntries(),
      socialStore.listIpBlacklistEntries(),
      socialStore.listIpAbuseFlags()
    ]);
    return {
      ...legacySnapshot,
      blacklist,
      ipBlacklist,
      ipAbuseFlags
    };
  };

  const initialSnapshot = await loadSnapshot();

  return createSseResponse(request, (send) => {
    let closed = false;
    let lastSnapshot = JSON.stringify(initialSnapshot);
    send('snapshot', initialSnapshot);

    const pollSnapshot = async () => {
      if (closed) {
        return;
      }

      const snapshot = await loadSnapshot();
      const nextSerialized = JSON.stringify(snapshot);
      if (nextSerialized !== lastSnapshot) {
        lastSnapshot = nextSerialized;
        send('snapshot', snapshot);
      }
    };

    const keepAlive = setInterval(() => {
      send('ping', { t: Date.now() });
    }, CHAT_LIMITS.sseKeepAliveMs);

    const pollTimer = setInterval(() => {
      void pollSnapshot();
    }, CHAT_LIMITS.adminPollMs);

    return () => {
      closed = true;
      clearInterval(keepAlive);
      clearInterval(pollTimer);
    };
  });
}
