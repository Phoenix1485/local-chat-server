import { requireSession } from '@/lib/appAuth';
import { isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ userId: string }> }
): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { userId } = await context.params;
  if (!userId || !isUuid(userId)) {
    return jsonError('Invalid userId.', 422);
  }

  const avatar = await socialStore.getAvatar(userId);
  if (!avatar) {
    return jsonError('Avatar not found.', 404);
  }

  return new Response(avatar.buffer, {
    headers: {
      'Content-Type': avatar.mimeType,
      'Cache-Control': 'public, max-age=60'
    }
  });
}
