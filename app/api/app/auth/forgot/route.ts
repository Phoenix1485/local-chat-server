import { enforceSameOrigin, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ForgotPayload = {
  identifier?: string;
};

export async function POST(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  let payload: ForgotPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const identifier = payload.identifier?.trim() ?? '';
  if (!identifier) {
    return jsonError('Identifier is required.', 422);
  }

  const resetToken = await socialStore.requestPasswordReset(identifier);
  return Response.json(
    {
      ok: true,
      resetToken
    },
    {
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  );
}
