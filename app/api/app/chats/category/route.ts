import { requireSession } from '@/lib/appAuth';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';
import { validateRoomName } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CategoryPayload = {
  action?: 'create' | 'rename' | 'move' | 'delete' | 'assign_chat';
  categoryId?: string | null;
  chatId?: string;
  name?: string;
  direction?: 'up' | 'down';
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

  let payload: CategoryPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const action = payload.action;
  if (!action || !['create', 'rename', 'move', 'delete', 'assign_chat'].includes(action)) {
    return jsonError('Invalid action.', 422);
  }

  const categoryId =
    payload.categoryId === null
      ? null
      : typeof payload.categoryId === 'string'
        ? payload.categoryId.trim()
        : '';

  if (categoryId && !isUuid(categoryId)) {
    return jsonError('Invalid categoryId.', 422);
  }

  try {
    if (action === 'create') {
      const name = payload.name?.trim() ?? '';
      const nameError = validateRoomName(name, 2, 80);
      if (nameError) {
        return jsonError(nameError, 422);
      }
      const category = await socialStore.createChatCategory(auth.session.user.id, name);
      return Response.json({ category });
    }

    if (action === 'rename') {
      if (!categoryId) {
        return jsonError('categoryId is required.', 422);
      }
      const name = payload.name?.trim() ?? '';
      const nameError = validateRoomName(name, 2, 80);
      if (nameError) {
        return jsonError(nameError, 422);
      }
      const category = await socialStore.renameChatCategory(auth.session.user.id, categoryId, name);
      return Response.json({ category });
    }

    if (action === 'move') {
      if (!categoryId) {
        return jsonError('categoryId is required.', 422);
      }
      if (payload.direction !== 'up' && payload.direction !== 'down') {
        return jsonError('Invalid direction.', 422);
      }
      await socialStore.moveChatCategory(auth.session.user.id, categoryId, payload.direction);
      return Response.json({ ok: true });
    }

    if (action === 'delete') {
      if (!categoryId) {
        return jsonError('categoryId is required.', 422);
      }
      await socialStore.deleteChatCategory(auth.session.user.id, categoryId);
      return Response.json({ ok: true });
    }

    const chatId = payload.chatId?.trim() ?? '';
    if (!chatId || !isUuid(chatId)) {
      return jsonError('Invalid chatId.', 422);
    }
    await socialStore.setGroupChatCategory(auth.session.user.id, chatId, categoryId);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Category update failed.', 422);
  }
}
