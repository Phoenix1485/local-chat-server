import { CHAT_LIMITS } from '@/lib/config';
import { enforceSameOrigin, isUuid, jsonError } from '@/lib/http';
import { rateLimiter } from '@/lib/rateLimiter';
import { chatStore } from '@/lib/store';
import { validateMessage } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/\r\n]/g, '_').slice(0, 140) || 'upload.bin';
}

export async function POST(request: Request): Promise<Response> {
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  const formData = await request.formData();
  const sessionId = String(formData.get('sessionId') ?? '').trim();
  const chatId = String(formData.get('chatId') ?? '').trim();
  const text = String(formData.get('text') ?? '').trim();
  const file = formData.get('file');

  if (!sessionId) {
    return jsonError('Missing sessionId.', 400);
  }

  if (!chatId) {
    return jsonError('Missing chatId.', 400);
  }

  if (!isUuid(sessionId) || !isUuid(chatId)) {
    return jsonError('Invalid sessionId or chatId.', 422);
  }

  const limit = await rateLimiter.check(`upload:${sessionId}`, 8, 60_000);
  if (!limit.ok) {
    return jsonError('Rate limit exceeded for uploads.', 429);
  }

  const user = await chatStore.getUser(sessionId);
  if (!user) {
    return jsonError('Session not found.', 404);
  }

  if (user.status !== 'approved') {
    return jsonError('Session is not approved.', 403);
  }

  const accessibleChat = await chatStore.getAccessibleChatForUser(sessionId, chatId);
  if (!accessibleChat) {
    return jsonError('Chat not accessible.', 403);
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

  let messageText = text;
  if (messageText) {
    const error = validateMessage(messageText, CHAT_LIMITS.messageMaxLength);
    if (error) {
      return jsonError(error, 422);
    }
  } else {
    messageText = `shared a file: ${sanitizeFileName(file.name)}`;
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let stored;
  try {
    stored = await chatStore.storeUpload(sessionId, chatId, {
      fileName: sanitizeFileName(file.name),
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      buffer
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed.';
    return jsonError(message, 422);
  }

  const attachment = {
    id: stored.id,
    fileName: stored.fileName,
    mimeType: stored.mimeType,
    size: stored.size,
    uploadedAt: stored.uploadedAt,
    uploadedBy: stored.uploadedBy
  };

  const message = await chatStore.addMessage(sessionId, chatId, messageText, [attachment]);
  if (!message) {
    return jsonError('Upload stored but chat message could not be created.', 500);
  }

  return Response.json({ attachment, message });
}
