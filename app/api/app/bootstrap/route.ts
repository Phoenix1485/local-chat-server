import { requireSession } from '@/lib/appAuth';
import { jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const chatId = url.searchParams.get('chatId')?.trim() ?? '';

  try {
    const bootstrap = await socialStore.getBootstrap(auth.session.user.id, chatId || undefined);
    return Response.json(bootstrap, {
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Bootstrap failed.', 500);
  }
}
