import { requireSession } from '@/lib/appAuth';
import { PermissionDeniedError } from '@/lib/groupPermissions';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';
import type { AppModerationReportReason } from '@/types/social';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReportPayload = {
  chatId?: string;
  messageId?: string | null;
  targetUserId?: string | null;
  reason?: AppModerationReportReason;
  notes?: string | null;
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

  let payload: ReportPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const chatId = payload.chatId?.trim() ?? '';
  const messageId = payload.messageId?.trim() ?? '';
  const targetUserId = payload.targetUserId?.trim() ?? '';

  if (!chatId || !isUuid(chatId)) {
    return jsonError('Invalid chatId.', 422);
  }
  if (messageId && !isUuid(messageId)) {
    return jsonError('Invalid messageId.', 422);
  }
  if (targetUserId && !isUuid(targetUserId)) {
    return jsonError('Invalid targetUserId.', 422);
  }
  if (!payload.reason || !['spam', 'harassment', 'hate', 'violence', 'sexual', 'impersonation', 'privacy', 'other'].includes(payload.reason)) {
    return jsonError('Invalid reason.', 422);
  }

  try {
    const report = await socialStore.createModerationReport(auth.session.user.id, chatId, {
      messageId: messageId || null,
      targetUserId: targetUserId || null,
      reason: payload.reason,
      notes: payload.notes ?? null
    });
    return Response.json({ report });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return jsonError(error.message, 403);
    }
    return jsonError(error instanceof Error ? error.message : 'Report could not be created.', 422);
  }
}
