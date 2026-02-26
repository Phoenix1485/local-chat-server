import { CHAT_LIMITS } from '@/lib/config';
import { isUuid, jsonError } from '@/lib/http';
import { createSseResponse } from '@/lib/sse';
import { chatStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  const chatId = url.searchParams.get('chatId')?.trim();

  if (!sessionId) {
    return jsonError('Missing sessionId.', 400);
  }

  if (!chatId) {
    return jsonError('Missing chatId.', 400);
  }

  if (!isUuid(sessionId) || !isUuid(chatId)) {
    return jsonError('Invalid sessionId or chatId.', 422);
  }

  const user = await chatStore.getUser(sessionId);
  if (!user) {
    return jsonError('Session not found.', 404);
  }

  if (user.status !== 'approved') {
    return jsonError('Session is not approved.', 403);
  }

  const accessibleChat = await chatStore.getAccessibleChatForUser(sessionId, chatId);
  if (!accessibleChat) {
    return jsonError('Chat not accessible.', 403);
  }

  await chatStore.touchUserPresence(sessionId);

  const initialMessages = await chatStore.getRecentMessages(chatId);

  return createSseResponse(request, (send, close) => {
    let closed = false;
    let currentStatus = user.status;
    let lastSeenCreatedAt = initialMessages.at(-1)?.createdAt ?? 0;
    const sentMessageIds = new Set(initialMessages.map((message) => message.id));

    send('history', { messages: initialMessages });
    send('session', { status: currentStatus });

    const poll = async () => {
      if (closed) {
        return;
      }

      await chatStore.touchUserPresence(sessionId);

      const latestUser = await chatStore.getUser(sessionId);
      if (!latestUser) {
        send('session', { status: 'rejected' });
        close();
        return;
      }

      if (latestUser.status !== currentStatus) {
        currentStatus = latestUser.status;
        send('session', { status: latestUser.status });
        if (latestUser.status !== 'approved') {
          close();
          return;
        }
      }

      const latestChat = await chatStore.getAccessibleChatForUser(sessionId, chatId);
      if (!latestChat) {
        send('chat', { status: 'unavailable' });
        close();
        return;
      }

      const messages = await chatStore.getMessagesSince(chatId, lastSeenCreatedAt);
      for (const message of messages) {
        if (sentMessageIds.has(message.id)) {
          continue;
        }

        sentMessageIds.add(message.id);
        if (message.createdAt > lastSeenCreatedAt) {
          lastSeenCreatedAt = message.createdAt;
        }
        send('message', { message });
      }

      if (sentMessageIds.size > CHAT_LIMITS.maxMessagesInMemory * 2) {
        const recent = new Set(messages.map((message) => message.id));
        sentMessageIds.forEach((id) => {
          if (!recent.has(id)) {
            sentMessageIds.delete(id);
          }
        });
      }
    };

    const keepAlive = setInterval(() => {
      send('ping', { t: Date.now() });
    }, CHAT_LIMITS.sseKeepAliveMs);

    const pollTimer = setInterval(() => {
      void poll();
    }, CHAT_LIMITS.streamPollMs);

    return () => {
      closed = true;
      clearInterval(keepAlive);
      clearInterval(pollTimer);
    };
  });
}
