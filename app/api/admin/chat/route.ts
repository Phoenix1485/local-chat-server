import { isAdminAuthorized } from '@/lib/adminAuth';
import { jsonError } from '@/lib/http';
import { chatStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AdminChatPayload = {
  action?: 'reactivate';
  chatId?: string;
};

export async function POST(request: Request): Promise<Response> {
  if (!isAdminAuthorized(request)) {
    return jsonError('Unauthorized.', 401);
  }

  let payload: AdminChatPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const chatId = payload.chatId?.trim();
  if (!chatId) {
    return jsonError('Missing chatId.', 400);
  }

  if (payload.action !== 'reactivate') {
    return jsonError('Invalid action.', 422);
  }

  try {
    await chatStore.reactivateChat(chatId);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Chat reactivation failed.', 422);
  }

  return Response.json({ ok: true });
}
