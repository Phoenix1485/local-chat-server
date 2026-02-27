import { CLEAR_SESSION_COOKIE, readSessionToken } from '@/lib/appAuth';
import { enforceSameOrigin } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  const token = readSessionToken(request);
  if (token) {
    await socialStore.logoutSession(token);
  }

  return Response.json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': CLEAR_SESSION_COOKIE,
        'Cache-Control': 'no-store'
      }
    }
  );
}
