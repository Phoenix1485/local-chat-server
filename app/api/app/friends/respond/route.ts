import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { requireSession } from '@/lib/appAuth';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RespondPayload = {
  requestId?: string;
  action?: 'accept' | 'decline';
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

  let payload: RespondPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const requestId = payload.requestId?.trim() ?? '';
  const action = payload.action;

  if (!requestId || !isUuid(requestId)) {
    return jsonError('Invalid requestId.', 422);
  }

  if (action !== 'accept' && action !== 'decline') {
    return jsonError('Invalid action.', 422);
  }

  try {
    await socialStore.respondToFriendRequest(auth.session.user.id, requestId, action);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not respond to friend request.', 422);
  }
}
