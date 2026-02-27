import { requireSession } from '@/lib/appAuth';
import { enforceSameOrigin, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';
import { validateBio, validateEmail } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UpdateProfilePayload = {
  firstName?: string;
  lastName?: string;
  bio?: string;
  email?: string | null;
};

export async function GET(request: Request): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  return Response.json(
    {
      profile: auth.session.user
    },
    {
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  );
}

export async function PATCH(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  let payload: UpdateProfilePayload;
  try {
    payload = await request.json();
  } catch {
    return jsonError('Invalid JSON payload.', 400);
  }

  const firstName = payload.firstName?.trim() ?? '';
  const lastName = payload.lastName?.trim() ?? '';
  const bio = payload.bio?.trim() ?? '';
  const emailRaw = typeof payload.email === 'string' ? payload.email.trim() : '';

  if (!firstName || !lastName) {
    return jsonError('First name and last name are required.', 422);
  }

  const bioError = validateBio(bio);
  if (bioError) {
    return jsonError(bioError, 422);
  }

  const emailError = validateEmail(emailRaw);
  if (emailError) {
    return jsonError(emailError, 422);
  }

  try {
    const profile = await socialStore.updateMyProfile(auth.session.user.id, {
      firstName,
      lastName,
      bio,
      email: emailRaw || null
    });
    return Response.json({ profile });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Could not update profile.', 422);
  }
}
