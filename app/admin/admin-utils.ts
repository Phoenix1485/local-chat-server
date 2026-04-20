import type { AdminSnapshot } from '@/types/chat';

export type CategoryId = 'overview' | 'users' | 'content' | 'security';

export type PaginationKey =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'userDirectory'
  | 'activeChats'
  | 'deactivatedChats'
  | 'recentMessages'
  | 'blacklist'
  | 'ipBlacklist'
  | 'ipAbuseFlags';

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  totalPages: number;
  totalItems: number;
  rangeStart: number;
  rangeEnd: number;
};

export const CATEGORY_DEFINITIONS: Array<{
  id: CategoryId;
  eyebrow: string;
  label: string;
  description: string;
}> = [
  {
    id: 'overview',
    eyebrow: 'Mission control',
    label: 'Overview',
    description: 'Live counters, pending actions, and the fastest path to what needs attention.'
  },
  {
    id: 'users',
    eyebrow: 'Access',
    label: 'Users',
    description: 'Review people, reset passwords, and clean up accounts from one focused workspace.'
  },
  {
    id: 'content',
    eyebrow: 'Activity',
    label: 'Content',
    description: 'Track rooms, reactivate disabled chats, and monitor message traffic.'
  },
  {
    id: 'security',
    eyebrow: 'Defense',
    label: 'Security',
    description: 'Manage identity blacklists, network rules, and abuse signals without endless scrolling.'
  }
];

export const PAGE_SIZES: Record<PaginationKey, number> = {
  pending: 4,
  approved: 5,
  rejected: 5,
  userDirectory: 8,
  activeChats: 5,
  deactivatedChats: 5,
  recentMessages: 6,
  blacklist: 5,
  ipBlacklist: 5,
  ipAbuseFlags: 5
};

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function formatDateTime(value: number | null | undefined) {
  if (!value) {
    return 'Not available';
  }

  return new Date(value).toLocaleString();
}

export function formatTime(value: number) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export async function readServerError(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return fallback;
  }

  const payload = await response.json().catch(() => null);
  if (payload && typeof payload === 'object' && 'error' in payload) {
    return String(payload.error);
  }

  return fallback;
}

export async function fetchAdminSnapshot(token: string): Promise<AdminSnapshot> {
  const response = await fetch('/api/admin/state', {
    headers: {
      'x-admin-token': token
    },
    cache: 'no-store'
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload =
    contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : null;

  if (!response.ok) {
    const serverError =
      payload && typeof payload === 'object' && 'error' in payload ? String(payload.error) : null;

    if (response.status === 401) {
      throw new Error(serverError ?? 'Unauthorized. The admin token is invalid, expired, or the ADMIN_KEY does not match.');
    }

    throw new Error(serverError ?? `Admin state could not be loaded (${response.status}).`);
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Admin state response is invalid.');
  }

  return payload as AdminSnapshot;
}

export function paginate<T>(items: T[], page: number | undefined, pageSize: number): PaginatedResult<T> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(page ?? 1, 1), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  return {
    items: items.slice(startIndex, endIndex),
    page: safePage,
    totalPages,
    totalItems,
    rangeStart: totalItems === 0 ? 0 : startIndex + 1,
    rangeEnd: endIndex
  };
}
