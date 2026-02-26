import { ADMIN_KEY } from '@/lib/config';
import { isAdminTokenValid } from '@/lib/adminToken';

export function isAdminAuthorized(request: Request): boolean {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('adminToken');
  const headerToken = request.headers.get('x-admin-token');
  const token = queryToken ?? headerToken;

  if (token && isAdminTokenValid(token)) {
    return true;
  }

  const queryKey = url.searchParams.get('adminKey');
  const headerKey = request.headers.get('x-admin-key');
  const key = queryKey ?? headerKey;
  return key === ADMIN_KEY;
}
