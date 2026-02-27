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

  const context = await socialStore.getChatContext(auth.session.user.id, chatId);
  if (!context) {
    return jsonError('Chat not found or inaccessible.', 404);
  }

  return Response.json(
    { context },
    {
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  );
}
