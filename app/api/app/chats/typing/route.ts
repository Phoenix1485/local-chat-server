import { requireSession } from '@/lib/appAuth';
import { PermissionDeniedError } from '@/lib/groupPermissions';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { GroupMutedError, socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TypingPayload = {
  chatId?: string;
  isTyping?: boolean;
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

  let payload: TypingPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const chatId = payload.chatId?.trim() ?? '';
  const isTyping = payload.isTyping === true;
  if (!chatId || !isUuid(chatId)) {
    return jsonError('Invalid chatId.', 422);
  }

  try {
    await socialStore.setTyping(auth.session.user.id, chatId, isTyping);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof PermissionDeniedError || error instanceof GroupMutedError) {
      return jsonError(error.message, 403);
    }
    return jsonError(error instanceof Error ? error.message : 'Typing update failed.', 422);
  }
}
