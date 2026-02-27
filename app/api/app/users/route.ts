import { requireSession } from '@/lib/appAuth';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim() ?? '';
  const users = await socialStore.listDiscoverUsers(auth.session.user.id, query);
  return Response.json(
    { users },
    {
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  );
}
