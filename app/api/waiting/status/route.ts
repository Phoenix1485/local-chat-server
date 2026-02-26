import { isUuid, jsonError } from '@/lib/http';
import { chatStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    return jsonError('Missing sessionId.', 400);
  }

  if (!isUuid(sessionId)) {
    return jsonError('Invalid sessionId.', 422);
  }

  const user = await chatStore.getUser(sessionId);
  if (!user) {
    return jsonError('Session not found.', 404);
  }

  return Response.json({
    status: user.status,
    updatedAt: user.updatedAt
  });
}
