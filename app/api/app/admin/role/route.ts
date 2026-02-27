import { requireSession } from '@/lib/appAuth';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';
import type { GlobalRole } from '@/types/social';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RolePayload = {
  targetUserId?: string;
  role?: GlobalRole;
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

  let payload: RolePayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const targetUserId = payload.targetUserId?.trim() ?? '';
  const role = payload.role;

  if (!targetUserId || !isUuid(targetUserId)) {
    return jsonError('Invalid targetUserId.', 422);
  }

  if (role !== 'user' && role !== 'admin' && role !== 'superadmin') {
    return jsonError('Invalid role.', 422);
  }

  try {
    await socialStore.setGlobalRole(auth.session.user.id, targetUserId, role);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Role update failed.', 422);
  }
}
