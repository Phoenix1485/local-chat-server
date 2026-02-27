import { requireSession } from '@/lib/appAuth';
import { CHAT_LIMITS } from '@/lib/config';
import { isUuid, jsonError } from '@/lib/http';
import { createSseResponse } from '@/lib/sse';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const chatId = url.searchParams.get('chatId')?.trim() ?? '';
  if (!chatId || !isUuid(chatId)) {
    return jsonError('Invalid chatId.', 422);
  }

  const initial = await socialStore.getChatContext(auth.session.user.id, chatId);
  if (!initial) {
    return jsonError('Chat not found or inaccessible.', 404);
  }

  return createSseResponse(request, (send, close) => {
    let closed = false;
    let lastSeenCreatedAt = initial.messages.at(-1)?.createdAt ?? 0;
    let lastTypingSerialized = '[]';
    const sentMessageIds = new Set(initial.messages.map((message) => message.id));
    const messageSnapshotById = new Map<string, string>();
    for (const message of initial.messages) {
      messageSnapshotById.set(
        message.id,
        JSON.stringify({
          text: message.text,
          editedAt: message.editedAt,
          deletedForAll: message.deletedForAll,
          reactions: message.reactions,
          poll: message.poll,
          readBy: message.readBy
        })
      );
    }

    send('history', { messages: initial.messages });

    const poll = async () => {
      if (closed) {
        return;
      }

      const authState = await socialStore.resolveSession(auth.token);
      if (!authState) {
        send('session', { status: 'expired' });
        close();
        return;
      }

      const context = await socialStore.getChatContext(authState.user.id, chatId);
      if (!context) {
        send('chat', { status: 'unavailable' });
        close();
        return;
      }

      const messages = await socialStore.listMessagesSince(chatId, lastSeenCreatedAt, authState.user.id);
      for (const message of messages) {
        if (sentMessageIds.has(message.id)) {
          continue;
        }
        sentMessageIds.add(message.id);
        messageSnapshotById.set(
          message.id,
          JSON.stringify({
            text: message.text,
            editedAt: message.editedAt,
            deletedForAll: message.deletedForAll,
            reactions: message.reactions,
            poll: message.poll,
            readBy: message.readBy
          })
        );
        if (message.createdAt > lastSeenCreatedAt) {
          lastSeenCreatedAt = message.createdAt;
        }
        send('message', { message });
      }

      for (const message of context.messages) {
        if (!sentMessageIds.has(message.id)) {
          continue;
        }
        const nextSnapshot = JSON.stringify({
          text: message.text,
          editedAt: message.editedAt,
          deletedForAll: message.deletedForAll,
          reactions: message.reactions,
          poll: message.poll,
          readBy: message.readBy
        });
        const prevSnapshot = messageSnapshotById.get(message.id);
        if (prevSnapshot !== nextSnapshot) {
          messageSnapshotById.set(message.id, nextSnapshot);
          send('message_update', { message });
        }
      }

      const typingUsers = await socialStore.listTypingUsers(chatId, authState.user.id);
      const serializedTyping = JSON.stringify(typingUsers.map((user) => user.id).sort());
      if (serializedTyping !== lastTypingSerialized) {
        lastTypingSerialized = serializedTyping;
        send('typing', { users: typingUsers });
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
