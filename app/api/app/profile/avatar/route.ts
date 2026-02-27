import { APP_LIMITS } from '@/lib/config';
import { requireSession } from '@/lib/appAuth';
import { enforceSameOrigin, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export async function POST(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return jsonError('Avatar file is required.', 422);
  }

  if (file.size <= 0 || file.size > APP_LIMITS.profileAvatarMaxBytes) {
    return jsonError(`Avatar must be between 1 byte and ${Math.floor(APP_LIMITS.profileAvatarMaxBytes / 1024)}KB.`, 422);
  }

  const mimeType = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.has(mimeType)) {
    return jsonError('Only png/jpeg/webp/gif avatars are allowed.', 422);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const updatedAt = await socialStore.setAvatar(auth.session.user.id, mimeType, buffer);
  return Response.json({ updatedAt });
}
