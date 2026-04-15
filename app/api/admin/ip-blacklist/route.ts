import { isAdminAuthorized } from '@/lib/adminAuth';
import { enforceSameOrigin, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CreateIpBlacklistPayload = {
  ip?: string;
  note?: string | null;
  scope?: {
    forbidRegister?: boolean;
    forbidLogin?: boolean;
    forbidReset?: boolean;
    forbidChat?: boolean;
    terminateSessions?: boolean;
  };
};

type DeletePayload = {
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

  let payload: CreateIpBlacklistPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const ip = payload.ip?.trim() ?? '';
  const scope = {
    forbidRegister: payload.scope?.forbidRegister !== false,
    forbidLogin: payload.scope?.forbidLogin !== false,
    forbidReset: payload.scope?.forbidReset !== false,
    forbidChat: payload.scope?.forbidChat !== false,
    terminateSessions: payload.scope?.terminateSessions !== false
  };

  if (!ip) {
    return jsonError('IP is required.', 422);
  }

  try {
    const entry = await socialStore.addIpBlacklistEntry(ip, scope, payload.note ?? null);
    return Response.json({ entry });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'IP blacklist update failed.', 422);
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

  let payload: DeletePayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const id = payload.id?.trim() ?? '';
  if (!id) {
    return jsonError('IP blacklist id is required.', 422);
  }

  await socialStore.removeIpBlacklistEntry(id);
  return Response.json({ ok: true });
}
