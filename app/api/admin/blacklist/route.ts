import { isAdminAuthorized } from '@/lib/adminAuth';
import { enforceSameOrigin, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CreateBlacklistPayload = {
  kind?: 'name' | 'email';
  value?: string;
  note?: string | null;
};

type DeleteBlacklistPayload = {
  id?: string;
};

export async function POST(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  if (!isAdminAuthorized(request)) {
    return jsonError('Unauthorized.', 401);
  }

  let payload: CreateBlacklistPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const kind = payload.kind === 'email' ? 'email' : payload.kind === 'name' ? 'name' : null;
  const value = payload.value?.trim() ?? '';
  const note = typeof payload.note === 'string' ? payload.note.trim() : null;

  if (!kind) {
    return jsonError('Invalid blacklist kind.', 422);
  }
  if (!value) {
    return jsonError('Blacklist value is required.', 422);
  }

  try {
    const entry = await socialStore.addBlacklistEntry(kind, value, note);
    return Response.json({ entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Blacklist update failed.';
    if (message.toLowerCase().includes('duplicate')) {
      return jsonError('Dieser Blacklist-Eintrag existiert bereits.', 422);
    }
    return jsonError(message, 422);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  if (!isAdminAuthorized(request)) {
    return jsonError('Unauthorized.', 401);
  }

  let payload: DeleteBlacklistPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const id = payload.id?.trim() ?? '';
  if (!id) {
    return jsonError('Blacklist id is required.', 422);
  }

  await socialStore.removeBlacklistEntry(id);
  return Response.json({ ok: true });
}
