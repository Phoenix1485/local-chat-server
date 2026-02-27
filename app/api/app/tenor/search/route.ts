import { requireSession } from '@/lib/appAuth';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TenorResult = {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
};

const TENOR_API_KEY = process.env.TENOR_API_KEY?.trim() ?? '';
const TENOR_CLIENT_KEY = process.env.TENOR_CLIENT_KEY?.trim() || 'localchat';
const TENOR_COUNTRY = process.env.TENOR_COUNTRY?.trim().toUpperCase() || 'US';
const TENOR_LOCALE = process.env.TENOR_LOCALE?.trim() || 'de_DE';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  const limitRaw = Number(new URL(request.url).searchParams.get('limit') ?? '40');
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 40;
  const pos = new URL(request.url).searchParams.get('pos')?.trim() ?? '';
  if (!query) {
    return Response.json({ results: [] as TenorResult[], next: null });
  }
  if (!TENOR_API_KEY) {
    return Response.json({ results: [] as TenorResult[], next: null });
  }

  const url = new URL('https://tenor.googleapis.com/v2/search');
  url.searchParams.set('key', TENOR_API_KEY);
  url.searchParams.set('client_key', TENOR_CLIENT_KEY);
  url.searchParams.set('country', TENOR_COUNTRY);
  url.searchParams.set('locale', TENOR_LOCALE);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('media_filter', 'gif,tinygif');
  url.searchParams.set('contentfilter', 'medium');
  if (pos) {
    url.searchParams.set('pos', pos);
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store'
    });
    if (!response.ok) {
      return jsonError('Tenor search failed.', 502);
    }
    const payload = (await response.json()) as {
      next?: string;
      results?: Array<{
        id?: string;
        content_description?: string;
        media_formats?: {
          gif?: { url?: string };
          tinygif?: { url?: string };
        };
      }>;
    };

    const results: TenorResult[] = [];
    for (const item of payload.results ?? []) {
      const id = item.id?.trim() ?? '';
      const gifUrl = item.media_formats?.gif?.url?.trim() ?? '';
      const preview = item.media_formats?.tinygif?.url?.trim() ?? gifUrl;
      if (!id || !gifUrl) {
        continue;
      }
      results.push({
        id,
        title: item.content_description?.trim() || 'GIF',
        url: gifUrl,
        previewUrl: preview
      });
    }

    const next = typeof payload.next === 'string' && payload.next.trim() ? payload.next.trim() : null;
    return Response.json({ results, next });
  } catch {
    return jsonError('Tenor search unavailable.', 502);
  }
}
