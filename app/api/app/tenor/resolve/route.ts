import { requireSession } from '@/lib/appAuth';
import { jsonError } from '@/lib/http';
import { resolveTenorGifFromInput } from '@/lib/tenor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const input = new URL(request.url);
  const value = input.searchParams.get('url')?.trim() ?? input.searchParams.get('id')?.trim() ?? '';
  if (!value) {
    return jsonError('Missing url or id.', 422);
  }

  const gif = await resolveTenorGifFromInput(value);
  return Response.json({ gif });
}
