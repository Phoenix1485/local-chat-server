import { isAdminAuthorized } from '@/lib/adminAuth';
import { jsonError } from '@/lib/http';
import { chatStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DecisionPayload = {
  sessionId?: string;
  action?: 'approve' | 'reject' | 'kick';
};

export async function POST(request: Request): Promise<Response> {
  if (!isAdminAuthorized(request)) {
    return jsonError('Unauthorized.', 401);
  }

  let payload: DecisionPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const sessionId = payload.sessionId?.trim();
  if (!sessionId) {
    return jsonError('Missing sessionId.', 400);
  }

  if (!payload.action || (payload.action !== 'approve' && payload.action !== 'reject' && payload.action !== 'kick')) {
    return jsonError('Invalid action.', 422);
  }

  const currentUser = await chatStore.getUser(sessionId);
  if (!currentUser) {
    return jsonError('Session not found.', 404);
  }

  if (payload.action === 'kick' && currentUser.status !== 'approved') {
    return jsonError('Only approved users can be kicked.', 422);
  }

  const nextStatus =
    payload.action === 'approve' ? 'approved' : payload.action === 'reject' ? 'rejected' : 'pending';

  const updatedUser = await chatStore.setUserStatus(sessionId, nextStatus, currentUser);
  if (!updatedUser) {
    return jsonError('Session not found.', 404);
  }

  if (payload.action === 'approve') {
    await chatStore.addMessage(sessionId, chatStore.getGlobalChatId(), 'joined the chat');
  }

  return Response.json({ user: updatedUser });
}
