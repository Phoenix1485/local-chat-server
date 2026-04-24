import { requireSession } from '@/lib/appAuth';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';
import { validateRoomName } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GroupPayload = {
  name?: string;
  memberIds?: string[];
  categoryId?: string | null;
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

  let payload: GroupPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const name = payload.name?.trim() ?? '';
  const memberIds = Array.isArray(payload.memberIds) ? payload.memberIds : [];
  const categoryId =
    payload.categoryId === null
      ? null
      : typeof payload.categoryId === 'string'
        ? payload.categoryId.trim()
        : '';
  const invalidMemberId = memberIds.some((id) => typeof id !== 'string' || !isUuid(id));
  if (invalidMemberId) {
    return jsonError('Invalid memberIds.', 422);
  }
  if (categoryId && !isUuid(categoryId)) {
    return jsonError('Invalid categoryId.', 422);
  }

  const nameError = validateRoomName(name, 2, 80);
  if (nameError) {
    return jsonError(nameError, 422);
  }

  try {
    const chat = await socialStore.createGroupChat(auth.session.user.id, name, memberIds, categoryId);
    return Response.json({ chat });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Group creation failed.', 422);
  }
}
