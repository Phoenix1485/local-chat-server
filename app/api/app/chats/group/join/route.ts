import { requireSession } from '@/lib/appAuth';
import { enforceSameOrigin, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JoinGroupPayload = {
  inviteCode?: string;
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

  let payload: JoinGroupPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const inviteCode = payload.inviteCode?.trim() ?? '';
  if (!inviteCode) {
    return jsonError('Invalid inviteCode.', 422);
  }

  try {
    const chat = await socialStore.joinGroupByInviteCode(auth.session.user.id, inviteCode);
    return Response.json({ chat });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Group join failed.', 422);
  }
}
