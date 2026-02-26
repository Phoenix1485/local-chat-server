export const CHAT_LIMITS = {
  nameMinLength: 2,
  nameMaxLength: 24,
  roomNameMinLength: 2,
  roomNameMaxLength: 48,
  messageMaxLength: 1000,
  uploadMaxBytes: parsePositiveInt(process.env.CHAT_UPLOAD_MAX_BYTES, 25 * 1024 * 1024),
  uploadMaxTotalBytes: parsePositiveInt(process.env.CHAT_UPLOAD_MAX_TOTAL_BYTES, 200 * 1024 * 1024),
  maxMessagesInMemory: parsePositiveInt(process.env.CHAT_MAX_MESSAGES_IN_MEMORY, 300),
  maxUploadsInMemory: parsePositiveInt(process.env.CHAT_MAX_UPLOADS_IN_MEMORY, 120),
  uploadTtlMs: 30 * 60 * 1000,
  userOnlineTtlMs: 60_000,
  deactivatedChatRetentionMs: 30 * 24 * 60 * 60 * 1000,
  sseKeepAliveMs: parsePositiveInt(process.env.CHAT_SSE_KEEP_ALIVE_MS, 15000),
  streamPollMs: parsePositiveInt(process.env.CHAT_STREAM_POLL_MS, 1400),
  adminPollMs: parsePositiveInt(process.env.CHAT_ADMIN_POLL_MS, 2000)
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
