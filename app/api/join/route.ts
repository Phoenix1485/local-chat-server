import { CHAT_LIMITS } from '@/lib/config';
import { getClientIp, jsonError } from '@/lib/http';
import { rateLimiter } from '@/lib/rateLimiter';
import { chatStore } from '@/lib/store';
import { normalizeName, validateName } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const ip = getClientIp(request);
    const limit = await rateLimiter.check(`join:${ip}`, 12, 60_000);
    if (!limit.ok) {
      return jsonError(`Too many join attempts. Retry in ${Math.ceil(limit.resetInMs / 1000)}s.`, 429);
    }

    let payload: { name?: string };
    try {
      payload = await request.json();
    } catch {
      return jsonError('Invalid JSON payload.');
    }

    const rawName = payload.name ?? '';
    const validationError = validateName(rawName, CHAT_LIMITS.nameMinLength, CHAT_LIMITS.nameMaxLength);
    if (validationError) {
      return jsonError(validationError, 422);
    }

    const user = await chatStore.createUser(normalizeName(rawName), ip);

    return Response.json({
      sessionId: user.id,
      status: user.status
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    console.error('Join API failed:', message);
    return jsonError(`Join request failed on server: ${message}`, 500);
  }
}
