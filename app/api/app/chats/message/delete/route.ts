import { requireSession } from '@/lib/appAuth';
import { PermissionDeniedError } from '@/lib/groupPermissions';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DeletePayload = {
  chatId?: string;
  messageId?: string;
  scope?: 'me' | 'all';
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

  let payload: DeletePayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const chatId = payload.chatId?.trim() ?? '';
  const messageId = payload.messageId?.trim() ?? '';
  const scope = payload.scope === 'all' ? 'all' : 'me';
  if (!chatId || !isUuid(chatId)) {
    return jsonError('Invalid chatId.', 422);
  }
  if (!messageId || !isUuid(messageId)) {
    return jsonError('Invalid messageId.', 422);
  }

  try {
    const result = await socialStore.deleteMessage(auth.session.user.id, chatId, messageId, scope);
    return Response.json(result);
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return jsonError(error.message, 403);
    }
    return jsonError(error instanceof Error ? error.message : 'Delete failed.', 422);
  }
}
