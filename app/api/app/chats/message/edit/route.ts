import { requireSession } from '@/lib/appAuth';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';
import { validateMessage } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type EditPayload = {
  chatId?: string;
  messageId?: string;
  text?: string;
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

  let payload: EditPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const chatId = payload.chatId?.trim() ?? '';
  const messageId = payload.messageId?.trim() ?? '';
  const text = payload.text?.trim() ?? '';
  if (!chatId || !isUuid(chatId)) {
    return jsonError('Invalid chatId.', 422);
  }
  if (!messageId || !isUuid(messageId)) {
    return jsonError('Invalid messageId.', 422);
  }
  const textError = validateMessage(text, 4000);
  if (textError) {
    return jsonError(textError, 422);
  }

  try {
    const message = await socialStore.editMessage(auth.session.user.id, chatId, messageId, text);
    return Response.json({ message });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Edit failed.', 422);
  }
}

