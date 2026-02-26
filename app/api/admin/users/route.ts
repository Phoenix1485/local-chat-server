import { isAdminAuthorized } from '@/lib/adminAuth';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { chatStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DeleteUsersPayload = {
  mode?: 'selected' | 'all';
  userIds?: string[];
};

export async function POST(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  if (!isAdminAuthorized(request)) {
    return jsonError('Unauthorized.', 401);
  }

  let payload: DeleteUsersPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const mode = payload.mode;
  if (mode !== 'selected' && mode !== 'all') {
    return jsonError('Invalid mode.', 422);
  }

  if (mode === 'selected') {
    const userIds = Array.isArray(payload.userIds) ? payload.userIds : [];
    if (userIds.length === 0) {
      return jsonError('No userIds provided.', 422);
    }

    if (userIds.length > 1000) {
      return jsonError('Too many userIds.', 422);
    }

    const invalid = userIds.some((id) => typeof id !== 'string' || !isUuid(id));
    if (invalid) {
      return jsonError('Invalid userIds payload.', 422);
    }

    const deleted = await chatStore.deleteUsers(userIds);
    return Response.json({ deleted });
  }

  const deleted = await chatStore.deleteUsers();
  return Response.json({ deleted });
}
