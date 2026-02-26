import { CHAT_LIMITS } from '@/lib/config';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { rateLimiter } from '@/lib/rateLimiter';
import { chatStore } from '@/lib/store';
import { normalizeName, validateRoomName } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CreateRoomPayload = {
  sessionId?: string;
  name?: string;
  inviteUserIds?: string[];
};

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId')?.trim();
  const chatId = url.searchParams.get('chatId')?.trim();

  if (!sessionId) {
    return jsonError('Missing sessionId.', 400);
  }

  if (!isUuid(sessionId) || (chatId && !isUuid(chatId))) {
    return jsonError('Invalid sessionId or chatId.', 422);
  }

  const user = await chatStore.getUser(sessionId);
  if (!user) {
    return jsonError('Session not found.', 404);
  }

  if (user.status !== 'approved') {
    return jsonError('Session is not approved.', 403);
  }

  const context = await chatStore.getChatContext(sessionId, chatId);
  if (!context) {
    return jsonError('No accessible chats found.', 404);
  }

  return Response.json(context);
}

export async function POST(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  let payload: CreateRoomPayload;

  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const sessionId = payload.sessionId?.trim();
  const rawName = payload.name ?? '';
  const inviteUserIds = Array.isArray(payload.inviteUserIds) ? payload.inviteUserIds : [];

  if (!sessionId) {
    return jsonError('Missing sessionId.', 400);
  }

  if (!isUuid(sessionId)) {
    return jsonError('Invalid sessionId.', 422);
  }

  if (inviteUserIds.length > 50) {
    return jsonError('Too many inviteUserIds (max 50).', 422);
  }

  const hasInvalidInviteId = inviteUserIds.some((id) => typeof id !== 'string' || !isUuid(id));
  if (hasInvalidInviteId) {
    return jsonError('Invalid inviteUserIds payload.', 422);
  }

  const validInviteIds = inviteUserIds;

  const limit = await rateLimiter.check(`create-room:${sessionId}`, 5, 60_000);
  if (!limit.ok) {
    return jsonError('Rate limit exceeded for room creation.', 429);
  }

  const validationError = validateRoomName(rawName, CHAT_LIMITS.roomNameMinLength, CHAT_LIMITS.roomNameMaxLength);
  if (validationError) {
    return jsonError(validationError, 422);
  }

  const created = await chatStore.createChat(sessionId, normalizeName(rawName), validInviteIds);
  if (!created) {
    return jsonError('Chat could not be created.', 403);
  }

  const context = await chatStore.getChatContext(sessionId, created.id);
  if (!context) {
    return jsonError('Chat was created but context could not be loaded.', 500);
  }

  return Response.json({
    chat: created,
    context
  });
}
