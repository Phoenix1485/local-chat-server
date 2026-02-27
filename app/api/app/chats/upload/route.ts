import { CHAT_LIMITS } from '@/lib/config';
import { requireSession } from '@/lib/appAuth';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]);

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/\r\n]/g, '_').slice(0, 140) || 'upload.bin';
}

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
  const chatId = String(formData.get('chatId') ?? '').trim();
  const file = formData.get('file');

  if (!chatId || !isUuid(chatId)) {
    return jsonError('Invalid chatId.', 422);
  }
  if (!(file instanceof File)) {
    return jsonError('Missing file.', 400);
  }
  if (file.size <= 0) {
    return jsonError('File is empty.', 422);
  }
  if (file.size > CHAT_LIMITS.uploadMaxBytes) {
    return jsonError(`File exceeds ${Math.floor(CHAT_LIMITS.uploadMaxBytes / 1024 / 1024)}MB limit.`, 422);
  }

  const mimeType = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.has(mimeType)) {
    return jsonError('Unsupported file type.', 422);
  }

  try {
    const attachment = await socialStore.storeUpload(auth.session.user.id, chatId, {
      fileName: sanitizeFileName(file.name),
      mimeType,
      size: file.size,
      buffer: Buffer.from(await file.arrayBuffer())
    });
    return Response.json({ attachment });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Upload failed.', 422);
  }
}

