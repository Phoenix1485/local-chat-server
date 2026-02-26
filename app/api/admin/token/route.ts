import { ADMIN_KEY } from '@/lib/config';
import { isAdminTokenValid, issueAdminToken } from '@/lib/adminToken';
import { jsonError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TokenRequestPayload = {
  adminKey?: string;
  currentToken?: string;
};

export async function POST(request: Request): Promise<Response> {
  let payload: TokenRequestPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const adminKey = payload.adminKey?.trim() ?? '';
  const currentToken = payload.currentToken?.trim() ?? '';
  const hasValidCurrentToken = currentToken ? isAdminTokenValid(currentToken) : false;

  if (adminKey !== ADMIN_KEY && !hasValidCurrentToken) {
    return jsonError('Unauthorized.', 401);
  }

  const issued = issueAdminToken();
  const expiresInMs = Math.max(issued.claims.expiresAt - Date.now(), 0);

  return Response.json({
    token: issued.token,
    issuedAt: issued.claims.issuedAt,
    expiresAt: issued.claims.expiresAt,
    expiresInMs
  });
}
