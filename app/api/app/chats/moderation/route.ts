import { requireSession } from '@/lib/appAuth';
import { isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const chatId = url.searchParams.get('chatId')?.trim() ?? '';
  if (!chatId || !isUuid(chatId)) {
    return jsonError('Invalid chatId.', 422);
  }
  const limitRaw = Number(url.searchParams.get('limit') ?? '80');
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 80;

  try {
    const logs = await socialStore.listGroupModerationLogs(auth.session.user.id, chatId, limit);
    return Response.json(
      { logs },
      {
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not load moderation logs.', 422);
  }
}
