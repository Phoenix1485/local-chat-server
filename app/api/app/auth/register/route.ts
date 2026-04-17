import { enforceSameOrigin, getClientDeviceMac, getClientIp, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';
import { validateEmail, validatePassword, validateUsername } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RegisterPayload = {
  username?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  deviceMac?: string;
};

export async function POST(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  let payload: RegisterPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const username = payload.username?.trim() ?? '';
  const password = payload.password ?? '';
  const firstName = payload.firstName?.trim() ?? '';
  const lastName = payload.lastName?.trim() ?? '';
  const email = payload.email?.trim() ?? '';
  const deviceMac = payload.deviceMac?.trim() || getClientDeviceMac(request);

  const usernameError = validateUsername(username);
  if (usernameError) {
    return jsonError(usernameError, 422);
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return jsonError(passwordError, 422);
  }

  if (firstName.length < 1 || firstName.length > 64 || lastName.length < 1 || lastName.length > 64) {
    return jsonError('First name and last name must be between 1 and 64 characters.', 422);
  }

  const emailError = validateEmail(email);
  if (emailError) {
    return jsonError(emailError, 422);
  }

  try {
    const created = await socialStore.registerAccount({
      username: username.toLowerCase(),
      password,
      firstName,
      lastName,
      email: email || undefined,
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? '',
      deviceMac
    });

    return Response.json({
      ok: true,
      status: created.status,
      userId: created.userId
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Registration failed.', 422);
  }
}
