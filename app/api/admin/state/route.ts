import { isAdminAuthorized } from '@/lib/adminAuth';
import { jsonError } from '@/lib/http';
import { socialStore } from '@/lib/socialStore';
import { chatStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  if (!isAdminAuthorized(request)) {
    return jsonError('Unauthorized.', 401);
  }

  const [legacySnapshot, blacklist, ipBlacklist, ipAbuseFlags] = await Promise.all([
    chatStore.getAdminSnapshot(),
    socialStore.listBlacklistEntries(),
    socialStore.listIpBlacklistEntries(),
    socialStore.listIpAbuseFlags()
  ]);
  return Response.json({
    ...legacySnapshot,
    blacklist,
    ipBlacklist,
    ipAbuseFlags
  });
}
