import { enforceSameOrigin, getClientIp, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';
import { validatePassword } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ResetPayload = {
  token?: string;
  password?: string;
};

export async function POST(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  let payload: ResetPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const token = payload.token?.trim() ?? '';
  const password = payload.password ?? '';

  if (!token) {
    return jsonError('Reset token is required.', 422);
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return jsonError(passwordError, 422);
  }

  let ok = false;
  try {
    ok = await socialStore.resetPassword(token, password, getClientIp(request));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Password reset failed.', 403);
  }
  if (!ok) {
    return jsonError('Reset token is invalid or expired.', 422);
  }

  return Response.json({ ok: true });
}
