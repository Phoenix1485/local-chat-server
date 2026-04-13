import { requireSession } from '@/lib/appAuth';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PinPayload = {
  chatId?: string;
  messageId?: string;
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

  let payload: PinPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const chatId = payload.chatId?.trim() ?? '';
  const messageId = payload.messageId?.trim() ?? '';
  if (!chatId || !isUuid(chatId)) {
    return jsonError('Invalid chatId.', 422);
  }
  if (!messageId || !isUuid(messageId)) {
    return jsonError('Invalid messageId.', 422);
  }

  try {
    const message = await socialStore.togglePinMessage(auth.session.user.id, chatId, messageId);
    return Response.json({ message });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Pin toggle failed.', 422);
  }
}
