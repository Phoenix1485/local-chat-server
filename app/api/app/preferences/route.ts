import { requireSession } from '@/lib/appAuth';
import { enforceSameOrigin, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UpdatePreferencesPayload = {
  desktopNotifications?: 'mentions' | 'none';
  playMentionSound?: boolean;
  showTypingIndicators?: boolean;
  showReadReceipts?: boolean;
  expandArchivedChats?: boolean;
};

export async function GET(request: Request): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const preferences = await socialStore.getUserPreferences(auth.session.user.id);
  return Response.json(
    { preferences },
    {
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  );
}

export async function PATCH(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  let payload: UpdatePreferencesPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const next: UpdatePreferencesPayload = {};

  if (payload.desktopNotifications !== undefined) {
    if (!['mentions', 'none'].includes(payload.desktopNotifications)) {
      return jsonError('Invalid desktopNotifications value.', 422);
    }
    next.desktopNotifications = payload.desktopNotifications;
  }
  if (payload.playMentionSound !== undefined) {
    if (typeof payload.playMentionSound !== 'boolean') {
      return jsonError('Invalid playMentionSound value.', 422);
    }
    next.playMentionSound = payload.playMentionSound;
  }
  if (payload.showTypingIndicators !== undefined) {
    if (typeof payload.showTypingIndicators !== 'boolean') {
      return jsonError('Invalid showTypingIndicators value.', 422);
    }
    next.showTypingIndicators = payload.showTypingIndicators;
  }
  if (payload.showReadReceipts !== undefined) {
    if (typeof payload.showReadReceipts !== 'boolean') {
      return jsonError('Invalid showReadReceipts value.', 422);
    }
    next.showReadReceipts = payload.showReadReceipts;
  }
  if (payload.expandArchivedChats !== undefined) {
    if (typeof payload.expandArchivedChats !== 'boolean') {
      return jsonError('Invalid expandArchivedChats value.', 422);
    }
    next.expandArchivedChats = payload.expandArchivedChats;
  }

  if (Object.keys(next).length === 0) {
    return jsonError('No preference changes supplied.', 422);
  }

  try {
    const preferences = await socialStore.updateUserPreferences(auth.session.user.id, next);
    return Response.json({ preferences });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not update preferences.', 422);
  }
}
