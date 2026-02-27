import { createSessionCookie } from '@/lib/appAuth';
import { enforceSameOrigin, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';
import { validatePassword } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LoginPayload = {
  identifier?: string;
  password?: string;
};

export async function POST(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  let payload: LoginPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const identifier = payload.identifier?.trim() ?? '';
  const password = payload.password ?? '';

  if (!identifier) {
    return jsonError('Identifier is required.', 422);
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return jsonError(passwordError, 422);
  }

  const loggedIn = await socialStore.loginAccount({
    identifier,
    password,
    userAgent: request.headers.get('user-agent') ?? ''
  });
  if (!loggedIn) {
    return jsonError('Invalid credentials.', 401);
  }

  return Response.json(
    {
      token: loggedIn.token,
      session: loggedIn.session
    },
    {
      headers: {
        'Set-Cookie': createSessionCookie(loggedIn.token, loggedIn.session.tokenExpiresAt),
        'Cache-Control': 'no-store'
      }
    }
  );
}

