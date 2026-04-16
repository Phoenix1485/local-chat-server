import { requireSession } from '@/lib/appAuth';
import { PermissionDeniedError } from '@/lib/groupPermissions';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';
import type { AppModerationReportStatus } from '@/types/social';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReportDecisionPayload = {
  chatId?: string;
  reportId?: string;
  status?: AppModerationReportStatus;
  decisionNotes?: string | null;
  moderationAction?: 'mute_1h' | 'mute_24h' | 'ban' | 'unmute' | 'unban' | null;
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

  let payload: ReportDecisionPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const chatId = payload.chatId?.trim() ?? '';
  const reportId = payload.reportId?.trim() ?? '';
  if (!chatId || !isUuid(chatId)) {
    return jsonError('Invalid chatId.', 422);
  }
  if (!reportId || !isUuid(reportId)) {
    return jsonError('Invalid reportId.', 422);
  }
  if (!payload.status || !['open', 'reviewing', 'resolved', 'dismissed'].includes(payload.status)) {
    return jsonError('Invalid status.', 422);
  }

  try {
    const report = await socialStore.decideModerationReport(auth.session.user.id, chatId, reportId, {
      status: payload.status,
      decisionNotes: payload.decisionNotes ?? null,
      moderationAction: payload.moderationAction ?? null
    });
    return Response.json({ report });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return jsonError(error.message, 403);
    }
    return jsonError(error instanceof Error ? error.message : 'Could not update report.', 422);
  }
}
