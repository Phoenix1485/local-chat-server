import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { requireSession } from '@/lib/appAuth';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RemovePayload = {
  targetUserId?: string;
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

  let payload: RemovePayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const targetUserId = payload.targetUserId?.trim() ?? '';
  if (!targetUserId || !isUuid(targetUserId)) {
    return jsonError('Invalid targetUserId.', 422);
  }

  await socialStore.removeFriend(auth.session.user.id, targetUserId);
  return Response.json({ ok: true });
}
