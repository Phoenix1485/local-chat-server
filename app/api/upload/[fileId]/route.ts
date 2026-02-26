import { jsonError } from '@/lib/http';
import { chatStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { fileId: string } }
): Promise<Response> {
  const sessionId = new URL(request.url).searchParams.get('sessionId')?.trim();
  if (!sessionId) {
    return jsonError('Missing sessionId.', 400);
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

  const safeFileName = upload.fileName.replace(/"/g, '_');

  return new Response(upload.buffer, {
    headers: {
      'Content-Type': upload.mimeType,
      'Content-Length': String(upload.size),
      'Content-Disposition': `inline; filename="${safeFileName}"`
    }
  });
}
