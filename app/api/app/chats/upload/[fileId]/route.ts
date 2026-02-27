import { requireSession } from '@/lib/appAuth';
import { isUuid, jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { fileId: string } }
): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth.ok) {
    return auth.response;
  }

  if (!isUuid(params.fileId)) {
    return jsonError('Invalid fileId.', 422);
  }

  const upload = await socialStore.getUploadForUser(auth.session.user.id, params.fileId);
  if (!upload) {
    return jsonError('File not found.', 404);
  }

  const safeFileName = upload.file_name.replace(/"/g, '_');
  return new Response(upload.buffer, {
    headers: {
      'Content-Type': upload.mime_type,
      'Content-Length': String(upload.size),
      'Content-Disposition': `inline; filename="${safeFileName}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

