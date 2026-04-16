import { requireSession } from '@/lib/appAuth';
import { PermissionDeniedError } from '@/lib/groupPermissions';
import { isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';
import type { AppModerationReportStatus } from '@/types/social';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const chatId = url.searchParams.get('chatId')?.trim() ?? '';
  const status = (url.searchParams.get('status')?.trim() ?? 'all') as AppModerationReportStatus | 'all';
  const limitRaw = Number(url.searchParams.get('limit') ?? '100');
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 100;

  if (!chatId || !isUuid(chatId)) {
    return jsonError('Invalid chatId.', 422);
  }
  if (!['all', 'open', 'reviewing', 'resolved', 'dismissed'].includes(status)) {
    return jsonError('Invalid status.', 422);
  }

  try {
    const reports = await socialStore.listModerationReports(auth.session.user.id, chatId, { status, limit });
    return Response.json({ reports }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return jsonError(error.message, 403);
    }
    return jsonError(error instanceof Error ? error.message : 'Could not load reports.', 422);
  }
}
