import { requireSession } from '@/lib/appAuth';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MemberPayload = {
  chatId?: string;
  targetUserId?: string;
  action?: 'invite' | 'promote' | 'demote' | 'kick' | 'transfer_ownership';
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

  let payload: MemberPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const chatId = payload.chatId?.trim() ?? '';
  const targetUserId = payload.targetUserId?.trim() ?? '';
  const action = payload.action;

  if (!chatId || !isUuid(chatId)) {
    return jsonError('Invalid chatId.', 422);
  }

  if (!targetUserId || !isUuid(targetUserId)) {
    return jsonError('Invalid targetUserId.', 422);
  }

  if (!action || !['invite', 'promote', 'demote', 'kick', 'transfer_ownership'].includes(action)) {
    return jsonError('Invalid action.', 422);
  }

  try {
    await socialStore.manageGroupMember(auth.session.user.id, chatId, targetUserId, action);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Group member action failed.', 422);
  }
}
