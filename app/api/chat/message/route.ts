import { CHAT_LIMITS } from '@/lib/config';
import { jsonError } from '@/lib/http';
import { rateLimiter } from '@/lib/rateLimiter';
import { chatStore } from '@/lib/store';
import { validateMessage } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MessagePayload = {
  sessionId?: string;
  text?: string;
};

export async function POST(request: Request): Promise<Response> {
  let payload: MessagePayload;

  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const sessionId = payload.sessionId?.trim();
  const text = payload.text ?? '';

  if (!sessionId) {
    return jsonError('Missing sessionId.', 400);
  }

  const limit = await rateLimiter.check(`message:${sessionId}`, 20, 10_000);
  if (!limit.ok) {
    return jsonError('Rate limit exceeded for messages.', 429);
  }

  const user = await chatStore.getUser(sessionId);
  if (!user) {
    return jsonError('Session not found.', 404);
  }

  if (user.status !== 'approved') {
    return jsonError('Session is not approved.', 403);
  }

  const validationError = validateMessage(text, CHAT_LIMITS.messageMaxLength);
  if (validationError) {
    return jsonError(validationError, 422);
  }

  const message = await chatStore.addMessage(sessionId, text.trim());
  if (!message) {
    return jsonError('Could not post message.', 500);
  }

  return Response.json({ message });
}
