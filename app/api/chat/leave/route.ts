import { jsonError } from '@/lib/http';
import { rateLimiter } from '@/lib/rateLimiter';
import { chatStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LeavePayload = {
  sessionId?: string;
  chatId?: string;
};

export async function POST(request: Request): Promise<Response> {
  let payload: LeavePayload;

  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const sessionId = payload.sessionId?.trim();
  const chatId = payload.chatId?.trim();

  if (!sessionId) {
    return jsonError('Missing sessionId.', 400);
  }

  if (!chatId) {
    return jsonError('Missing chatId.', 400);
  }

  const limit = await rateLimiter.check(`leave:${sessionId}`, 20, 60_000);
  if (!limit.ok) {
    return jsonError('Rate limit exceeded for leave operations.', 429);
  }

  const user = await chatStore.getUser(sessionId);
  if (!user) {
    return jsonError('Session not found.', 404);
  }

  if (user.status !== 'approved') {
    return jsonError('Session is not approved.', 403);
  }

  try {
    await chatStore.leaveChat(chatId, sessionId);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Leave failed.', 422);
  }

  const context = await chatStore.getChatContext(sessionId);
  if (!context) {
    return jsonError('No accessible chats found.', 404);
  }

  return Response.json({ context });
}
