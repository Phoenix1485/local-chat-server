import { isAdminAuthorized } from '@/lib/adminAuth';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';
import { validatePassword } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AdminPasswordPayload = {
  userId?: string;
  password?: string;
  revokeSessions?: boolean;
};

export async function POST(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  if (!isAdminAuthorized(request)) {
    return jsonError('Unauthorized.', 401);
  }

  let payload: AdminPasswordPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const userId = payload.userId?.trim() ?? '';
  const password = payload.password ?? '';
  const revokeSessions = payload.revokeSessions !== false;

  if (!userId || !isUuid(userId)) {
    return jsonError('Invalid userId.', 422);
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return jsonError(passwordError, 422);
  }

  try {
    await socialStore.adminSetUserPassword(userId, password, revokeSessions);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Password update failed.', 422);
  }
}
