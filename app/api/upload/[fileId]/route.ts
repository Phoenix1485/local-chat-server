import { isUuid, jsonError } from '@/lib/http';
import { chatStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { fileId: string } }
): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId')?.trim();
  const chatId = url.searchParams.get('chatId')?.trim();

  if (!sessionId) {
    return jsonError('Missing sessionId.', 400);
  }

  if (!chatId) {
    return jsonError('Missing chatId.', 400);
  }

  if (!isUuid(sessionId) || !isUuid(chatId) || !isUuid(params.fileId)) {
    return jsonError('Invalid sessionId, chatId, or fileId.', 422);
  }

  const user = await chatStore.getUser(sessionId);
  if (!user) {
    return jsonError('Session not found.', 404);
  }

  if (user.status !== 'approved') {
    return jsonError('Session is not approved.', 403);
  }

  const upload = await chatStore.getUpload(params.fileId);
  if (!upload) {
    return jsonError('File expired or not found.', 404);
  }

  if (upload.chatId !== chatId) {
    return jsonError('File does not belong to this chat.', 403);
  }

  const accessibleChat = await chatStore.getAccessibleChatForUser(sessionId, chatId);
  if (!accessibleChat) {
    return jsonError('Chat not accessible.', 403);
  }

  const safeFileName = upload.fileName.replace(/"/g, '_');

  return new Response(upload.buffer, {
    headers: {
      'Content-Type': upload.mimeType,
      'Content-Length': String(upload.size),
      'Content-Disposition': `inline; filename="${safeFileName}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
