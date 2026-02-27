import { requireSession } from '@/lib/appAuth';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PollVotePayload = {
  chatId?: string;
  messageId?: string;
  optionId?: string;
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

  let payload: PollVotePayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const chatId = payload.chatId?.trim() ?? '';
  const messageId = payload.messageId?.trim() ?? '';
  const optionId = payload.optionId?.trim() ?? '';

  if (!chatId || !isUuid(chatId)) {
    return jsonError('Invalid chatId.', 422);
  }
  if (!messageId || !isUuid(messageId)) {
    return jsonError('Invalid messageId.', 422);
  }
  if (!optionId || !isUuid(optionId)) {
    return jsonError('Invalid optionId.', 422);
  }

  try {
    const message = await socialStore.votePoll(auth.session.user.id, chatId, messageId, optionId);
    return Response.json({ message });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Poll vote failed.', 422);
  }
}

