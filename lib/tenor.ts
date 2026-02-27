export type TenorResolvedGif = {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
};

const TENOR_API_KEY = process.env.TENOR_API_KEY?.trim() ?? '';
const TENOR_CLIENT_KEY = process.env.TENOR_CLIENT_KEY?.trim() || 'localchat';
const TENOR_COUNTRY = process.env.TENOR_COUNTRY?.trim().toUpperCase() || 'US';
const TENOR_LOCALE = process.env.TENOR_LOCALE?.trim() || 'de_DE';

const TENOR_URL_REGEX = /https?:\/\/(?:www\.)?tenor\.com\/[^\s)]+/gi;

export function findFirstTenorUrl(text: string): string | null {
  const match = text.match(TENOR_URL_REGEX);
  return match?.[0]?.trim() || null;
}

export function stripTenorUrlFromText(text: string, tenorUrl: string): string {
  return text
    .replace(tenorUrl, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function extractTenorGifId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d{6,}$/.test(trimmed)) {
    return trimmed;
  }

  // Example: https://tenor.com/view/foo-bar-gif-9090029671315053901
  const linkMatch = trimmed.match(/tenor\.com\/(?:[a-z]{2}\/)?view\/[^?\s]*?-([0-9]{6,})(?:$|[?#/])/i);
  if (linkMatch?.[1]) {
    return linkMatch[1];
  }

  const fallback = trimmed.match(/-([0-9]{6,})$/);
  return fallback?.[1] ?? null;
}

export async function resolveTenorGifById(id: string): Promise<TenorResolvedGif | null> {
  if (!TENOR_API_KEY) {
    return null;
  }

  const gifId = id.trim();
  if (!gifId) {
    return null;
  }

  const url = new URL('https://tenor.googleapis.com/v2/posts');
  url.searchParams.set('key', TENOR_API_KEY);
  url.searchParams.set('client_key', TENOR_CLIENT_KEY);
  url.searchParams.set('country', TENOR_COUNTRY);
  url.searchParams.set('locale', TENOR_LOCALE);
  url.searchParams.set('ids', gifId);
  url.searchParams.set('media_filter', 'gif,tinygif');
  url.searchParams.set('contentfilter', 'medium');

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store'
    });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      results?: Array<{
        id?: string;
        content_description?: string;
        media_formats?: {
          gif?: { url?: string };
          tinygif?: { url?: string };
        };
      }>;
    };

    const item = payload.results?.[0];
    const resolvedId = item?.id?.trim() ?? '';
    const gifUrl = item?.media_formats?.gif?.url?.trim() ?? '';
    const previewUrl = item?.media_formats?.tinygif?.url?.trim() ?? gifUrl;
    if (!resolvedId || !gifUrl) {
      return null;
    }

    return {
      id: resolvedId,
      title: item?.content_description?.trim() || 'GIF',
      url: gifUrl,
      previewUrl
    };
  } catch {
    return null;
  }
}

export async function resolveTenorGifFromInput(input: string): Promise<TenorResolvedGif | null> {
  const id = extractTenorGifId(input);
  if (!id) {
    return null;
  }
  return resolveTenorGifById(id);
}
