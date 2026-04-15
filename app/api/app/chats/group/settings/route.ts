import { requireSession } from '@/lib/appAuth';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GroupSettingsPayload = {
  chatId?: string;
  action?: 'update' | 'regenerate_invite_link' | 'close_group';
  inviteMode?: 'direct' | 'invite_link';
  invitePolicy?: 'everyone' | 'admins' | 'owner';
  everyoneMentionPolicy?: 'everyone' | 'admins' | 'owner';
  hereMentionPolicy?: 'everyone' | 'admins' | 'owner';
  autoHideAfter24h?: boolean;
  messageCooldownMs?: number;
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

  let payload: GroupSettingsPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const chatId = payload.chatId?.trim() ?? '';
  const action = payload.action;

  if (!chatId || !isUuid(chatId)) {
    return jsonError('Invalid chatId.', 422);
  }

  if (!action || !['update', 'regenerate_invite_link', 'close_group'].includes(action)) {
    return jsonError('Invalid action.', 422);
  }

  try {
    if (action === 'update') {
      const inviteMode = payload.inviteMode;
      const invitePolicy = payload.invitePolicy;
      const everyoneMentionPolicy = payload.everyoneMentionPolicy;
      const hereMentionPolicy = payload.hereMentionPolicy;
      if (!inviteMode || !['direct', 'invite_link'].includes(inviteMode)) {
        return jsonError('Invalid inviteMode.', 422);
      }
      if (!invitePolicy || !['everyone', 'admins', 'owner'].includes(invitePolicy)) {
        return jsonError('Invalid invitePolicy.', 422);
      }
      if (!everyoneMentionPolicy || !['everyone', 'admins', 'owner'].includes(everyoneMentionPolicy)) {
        return jsonError('Invalid everyoneMentionPolicy.', 422);
      }
      if (!hereMentionPolicy || !['everyone', 'admins', 'owner'].includes(hereMentionPolicy)) {
        return jsonError('Invalid hereMentionPolicy.', 422);
      }
      if (typeof payload.messageCooldownMs !== 'number' || !Number.isFinite(payload.messageCooldownMs) || payload.messageCooldownMs < 0) {
        return jsonError('Invalid messageCooldownMs.', 422);
      }
      const settings = await socialStore.updateGroupSettings(auth.session.user.id, chatId, {
        inviteMode,
        invitePolicy,
        everyoneMentionPolicy,
        hereMentionPolicy,
        autoHideAfter24h: payload.autoHideAfter24h === true,
        messageCooldownMs: payload.messageCooldownMs
      });
      return Response.json({ settings });
    }

    if (action === 'regenerate_invite_link') {
      const settings = await socialStore.regenerateGroupInviteCode(auth.session.user.id, chatId);
      return Response.json({ settings });
    }

    await socialStore.closeGroupChat(auth.session.user.id, chatId);
    return Response.json({ closed: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Group settings action failed.', 422);
  }
}
