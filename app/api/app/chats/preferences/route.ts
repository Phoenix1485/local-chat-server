import { requireSession } from '@/lib/appAuth';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';
import { normalizeChatBackgroundStyle, validateChatBackgroundStyle, validateThemePreset } from '@/lib/validation';
import type { AppChatBackgroundStyle, ChatBackgroundPreset } from '@/types/social';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UpdateChatPreferencesPayload = {
  chatId?: string;
  archived?: boolean;
  notificationMode?: 'mentions' | 'mute';
  chatBackground?: ChatBackgroundPreset | null;
  chatBackgroundStyle?: AppChatBackgroundStyle | null;
};

export async function PATCH(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  let payload: UpdateChatPreferencesPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const chatId = payload.chatId?.trim() ?? '';
  if (!chatId || !isUuid(chatId)) {
    return jsonError('Invalid chatId.', 422);
  }

  const next: UpdateChatPreferencesPayload = { chatId };

  if (payload.archived !== undefined) {
    if (typeof payload.archived !== 'boolean') {
      return jsonError('Invalid archived value.', 422);
    }
    next.archived = payload.archived;
  }

  if (payload.notificationMode !== undefined) {
    if (!['mentions', 'mute'].includes(payload.notificationMode)) {
      return jsonError('Invalid notificationMode value.', 422);
    }
    next.notificationMode = payload.notificationMode;
  }

  if (payload.chatBackground !== undefined) {
    if (payload.chatBackground === null) {
      next.chatBackground = null;
    } else if (typeof payload.chatBackground === 'string') {
      const chatBackground = payload.chatBackground.trim();
      const backgroundError = validateThemePreset(chatBackground, ['aurora', 'sunset', 'midnight', 'forest', 'paper'] as const);
      if (backgroundError) {
        return jsonError(backgroundError, 422);
      }
      next.chatBackground = chatBackground as ChatBackgroundPreset;
    } else {
      return jsonError('Invalid chatBackground value.', 422);
    }
  }

  if (payload.chatBackgroundStyle !== undefined) {
    if (payload.chatBackgroundStyle === null) {
      next.chatBackgroundStyle = null;
    } else {
      const backgroundStyleError = validateChatBackgroundStyle(payload.chatBackgroundStyle);
      if (backgroundStyleError) {
        return jsonError(backgroundStyleError, 422);
      }
      next.chatBackgroundStyle = normalizeChatBackgroundStyle(payload.chatBackgroundStyle);
    }
  }

  if (
    next.archived === undefined &&
    next.notificationMode === undefined &&
    next.chatBackground === undefined &&
    next.chatBackgroundStyle === undefined
  ) {
    return jsonError('No chat preference changes supplied.', 422);
  }

  try {
    const chat = await socialStore.updateChatPreferences(auth.session.user.id, chatId, {
      archived: next.archived,
      notificationMode: next.notificationMode,
      chatBackground: next.chatBackground,
      chatBackgroundStyle: next.chatBackgroundStyle
    });
    return Response.json({ chat });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not update chat preferences.', 422);
  }
}
