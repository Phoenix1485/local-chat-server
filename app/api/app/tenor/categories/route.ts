import { requireSession } from '@/lib/appAuth';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TENOR_API_KEY = process.env.TENOR_API_KEY?.trim() ?? '';
const TENOR_CLIENT_KEY = process.env.TENOR_CLIENT_KEY?.trim() || 'localchat';
const TENOR_COUNTRY = process.env.TENOR_COUNTRY?.trim().toUpperCase() || 'US';
const TENOR_LOCALE = process.env.TENOR_LOCALE?.trim() || 'de_DE';

type TenorCategory = {
  searchterm: string;
  name: string;
  image: string;
};

export async function GET(request: Request): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  if (!TENOR_API_KEY) {
    return Response.json({ tags: [] as TenorCategory[] });
  }

  const url = new URL('https://tenor.googleapis.com/v2/categories');
  url.searchParams.set('key', TENOR_API_KEY);
  url.searchParams.set('client_key', TENOR_CLIENT_KEY);
  url.searchParams.set('country', TENOR_COUNTRY);
  url.searchParams.set('locale', TENOR_LOCALE);
  url.searchParams.set('type', 'featured');

  try {
    const response = await fetch(url.toString(), {
      cache: 'no-store'
    });
    if (!response.ok) {
      return jsonError('Tenor categories failed.', 502);
    }
    const payload = (await response.json()) as {
      tags?: Array<{
        searchterm?: string;
        name?: string;
        image?: string;
      }>;
    };
    const tags: TenorCategory[] = [];
    for (const tag of payload.tags ?? []) {
      const searchterm = tag.searchterm?.trim() ?? '';
      if (!searchterm) {
        continue;
      }
      tags.push({
        searchterm,
        name: tag.name?.trim() || searchterm,
        image: tag.image?.trim() || ''
      });
    }
    return Response.json({ tags });
  } catch {
    return jsonError('Tenor categories unavailable.', 502);
  }
}
