export const CHAT_LIMITS = {
  nameMinLength: 2,
  nameMaxLength: 24,
  roomNameMinLength: 2,
  roomNameMaxLength: 48,
  messageMaxLength: 1000,
  uploadMaxBytes: 10 * 1024 * 1024 * 1024,      // 10 GB pro Datei
  uploadMaxTotalBytes: 20 * 1024 * 1024 * 1024,  // 10 GB gesamt
  maxMessagesInMemory: 300,
  maxUploadsInMemory: 120,
  uploadTtlMs: 30 * 60 * 1000,
  userOnlineTtlMs: 60_000,
  deactivatedChatRetentionMs: 30 * 24 * 60 * 60 * 1000,
  sseKeepAliveMs: 15000
} as const;

export const GLOBAL_CHAT_ID = '00000000-0000-0000-0000-000000000001';

function parsePositiveInt(input: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(input ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export const ADMIN_KEY = process.env.ADMIN_KEY ?? 'change-me-in-env';
export const ADMIN_TOKEN_TTL_MINUTES = parsePositiveInt(process.env.ADMIN_TOKEN_TTL_MINUTES, 480);
export const ADMIN_TOKEN_TTL_MS = ADMIN_TOKEN_TTL_MINUTES * 60_000;

if (process.env.NODE_ENV === 'production' && ADMIN_KEY === 'change-me-in-env') {
  throw new Error('ADMIN_KEY must be set in production.');
}
