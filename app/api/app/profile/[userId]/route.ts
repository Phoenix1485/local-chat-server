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

  const profile = await socialStore.getProfile(auth.session.user.id, userId);
  if (!profile) {
    return jsonError('Profile not found.', 404);
  }

  return Response.json(
    { profile },
    {
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  );
}
