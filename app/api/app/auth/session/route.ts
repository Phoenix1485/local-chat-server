import { requireSession } from '@/lib/appAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  return Response.json(
    {
      session: auth.session
    },
    {
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  );
}
