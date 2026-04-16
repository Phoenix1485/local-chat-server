import { requireSession } from '@/lib/appAuth';
import { enforceSameOrigin, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';
import { validateBio, validateEmail, validateHexColor, validateNickname, validateThemePreset } from '@/lib/validation';
import type { ChatBackgroundPreset, NicknameScope } from '@/types/social';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UpdateProfilePayload = {
  firstName?: string;
  lastName?: string;
  bio?: string;
  email?: string | null;
  accentColor?: string;
  chatBackground?: ChatBackgroundPreset;
  nicknameSlots?: Array<{
    id?: string | null;
    nickname?: string;
    scope?: NicknameScope;
    chatId?: string | null;
  }>;
};

export async function GET(request: Request): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const profile = await socialStore.getProfile(auth.session.user.id, auth.session.user.id);
  if (!profile) {
    return jsonError('Profile not found.', 404);
  }

  return Response.json(
    {
      profile
    },
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

  let payload: UpdateProfilePayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const firstName = payload.firstName?.trim() ?? '';
  const lastName = payload.lastName?.trim() ?? '';
  const bio = payload.bio?.trim() ?? '';
  const emailRaw = typeof payload.email === 'string' ? payload.email.trim() : '';
  const accentColor = payload.accentColor?.trim() ?? '#38bdf8';
  const chatBackground = payload.chatBackground?.trim() ?? 'aurora';
  const nicknameSlots = Array.isArray(payload.nicknameSlots) ? payload.nicknameSlots : [];

  if (!firstName || !lastName) {
    return jsonError('First name and last name are required.', 422);
  }

  const bioError = validateBio(bio);
  if (bioError) {
    return jsonError(bioError, 422);
  }

  const emailError = validateEmail(emailRaw);
  if (emailError) {
    return jsonError(emailError, 422);
  }
  const colorError = validateHexColor(accentColor);
  if (colorError) {
    return jsonError(colorError, 422);
  }
  const backgroundError = validateThemePreset(chatBackground, ['aurora', 'sunset', 'midnight', 'forest', 'paper'] as const);
  if (backgroundError) {
    return jsonError(backgroundError, 422);
  }
  if (nicknameSlots.length > 3) {
    return jsonError('Only up to 3 nicknames are allowed.', 422);
  }
  for (const slot of nicknameSlots) {
    const nickname = slot.nickname?.trim() ?? '';
    if (!nickname) {
      return jsonError('Nickname is required.', 422);
    }
    const nicknameError = validateNickname(nickname, 2, 32);
    if (nicknameError) {
      return jsonError(nicknameError, 422);
    }
    if (slot.scope !== 'global' && slot.scope !== 'chat') {
      return jsonError('Nickname scope is invalid.', 422);
    }
    if (slot.scope === 'chat' && !(slot.chatId?.trim())) {
      return jsonError('Chat nickname requires a chatId.', 422);
    }
  }

  try {
    const profile = await socialStore.updateMyProfile(auth.session.user.id, {
      firstName,
      lastName,
      bio,
      email: emailRaw || null,
      accentColor,
      chatBackground: chatBackground as ChatBackgroundPreset,
      nicknameSlots: nicknameSlots.map((slot) => ({
        id: slot.id?.trim() || null,
        nickname: slot.nickname?.trim() ?? '',
        scope: (slot.scope === 'chat' ? 'chat' : 'global') as NicknameScope,
        chatId: slot.scope === 'chat' ? slot.chatId?.trim() || null : null
      }))
    });
    return Response.json({ profile });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not update profile.', 422);
  }
}
