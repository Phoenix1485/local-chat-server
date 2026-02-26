import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { rateLimiter } from '@/lib/rateLimiter';
import { chatStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type InvitePayload = {
  sessionId?: string;
  chatId?: string;
  targetUserId?: string;
};

export async function POST(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  let payload: InvitePayload;

  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const sessionId = payload.sessionId?.trim();
  const chatId = payload.chatId?.trim();
  const targetUserId = payload.targetUserId?.trim();

  if (!sessionId) {
    return jsonError('Missing sessionId.', 400);
  }

  if (!chatId) {
    return jsonError('Missing chatId.', 400);
  }

  if (!targetUserId) {
    return jsonError('Missing targetUserId.', 400);
  }

  if (!isUuid(sessionId) || !isUuid(chatId) || !isUuid(targetUserId)) {
    return jsonError('Invalid sessionId, chatId, or targetUserId.', 422);
  }

  const limit = await rateLimiter.check(`invite:${sessionId}`, 20, 60_000);
  if (!limit.ok) {
    return jsonError('Rate limit exceeded for invites.', 429);
  }

  const inviter = await chatStore.getUser(sessionId);
  if (!inviter) {
    return jsonError('Session not found.', 404);
  }

  if (inviter.status !== 'approved') {
    return jsonError('Session is not approved.', 403);
  }

  try {
    await chatStore.inviteToChat(chatId, sessionId, targetUserId);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Invite failed.', 422);
  }

  const context = await chatStore.getChatContext(sessionId, chatId);
  if (!context) {
    return jsonError('Chat context could not be loaded.', 500);
  }

  return Response.json({ context });
}
