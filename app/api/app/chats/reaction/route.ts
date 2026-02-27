import { requireSession } from '@/lib/appAuth';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReactionPayload = {
  chatId?: string;
  messageId?: string;
  emoji?: string;
};

export async function POST(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  let payload: ReactionPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const chatId = payload.chatId?.trim() ?? '';
  const messageId = payload.messageId?.trim() ?? '';
  const emoji = payload.emoji?.trim() ?? '';

  if (!chatId || !isUuid(chatId)) {
    return jsonError('Invalid chatId.', 422);
  }
  if (!messageId || !isUuid(messageId)) {
    return jsonError('Invalid messageId.', 422);
  }
  if (!emoji || emoji.length > 12) {
    return jsonError('Invalid emoji.', 422);
  }

  try {
    const message = await socialStore.toggleReaction(auth.session.user.id, chatId, messageId, emoji);
    return Response.json({ message });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Reaction failed.', 422);
  }
}

