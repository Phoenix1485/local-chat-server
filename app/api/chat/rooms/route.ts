import { CHAT_LIMITS } from '@/lib/config';
import { jsonError } from '@/lib/http';
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

  const limit = await rateLimiter.check(`create-room:${sessionId}`, 5, 60_000);
  if (!limit.ok) {
    return jsonError('Rate limit exceeded for room creation.', 429);
  }

  const validationError = validateRoomName(rawName, CHAT_LIMITS.roomNameMinLength, CHAT_LIMITS.roomNameMaxLength);
  if (validationError) {
    return jsonError(validationError, 422);
  }

  const created = await chatStore.createChat(sessionId, normalizeName(rawName), inviteUserIds);
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
