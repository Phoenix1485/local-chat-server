import type { UserSessionContext } from '@/lib/socialStore';
import { jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

const SESSION_HEADER = 'x-session-token';

function parseCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get('cookie');
  if (!cookie) {
    return null;
  }

  const entries = cookie.split(';');
  for (const entry of entries) {
    const [rawKey, ...rest] = entry.split('=');
    if (!rawKey || rest.length === 0) {
      continue;
    }
    if (rawKey.trim() !== name) {
      continue;
    }
    return decodeURIComponent(rest.join('=').trim());
  }

  return null;
}

export function readSessionToken(request: Request): string {
  const fromHeader = request.headers.get(SESSION_HEADER)?.trim();
  if (fromHeader) {
    return fromHeader;
  }

  const fromCookie = parseCookie(request, 'chat_session_token');
  if (fromCookie) {
    return fromCookie;
  }

  try {
    const url = new URL(request.url);
    return url.searchParams.get('sessionToken')?.trim() ?? '';
  } catch {
    return '';
  }
}

export function createSessionCookie(token: string, expiresAt: number): string {
  const maxAge = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
  return `chat_session_token=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly`;
}

export const CLEAR_SESSION_COOKIE =
  'chat_session_token=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly';

export async function requireSession(request: Request): Promise<
  | {
      ok: true;
      session: UserSessionContext;
      token: string;
    }
  | {
      ok: false;
      response: Response;
    }
> {
  const token = readSessionToken(request);
  if (!token) {
    return {
      ok: false,
      response: jsonError('Missing session token.', 401)
    };
  }

  const session = await socialStore.resolveSession(token);
  if (!session) {
    return {
      ok: false,
      response: jsonError('Invalid or expired session.', 401)
    };
  }

  return {
    ok: true,
    session,
    token
  };
}
