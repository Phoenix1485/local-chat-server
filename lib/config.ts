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
  adminPollMs: parsePositiveInt(process.env.CHAT_ADMIN_POLL_MS, 2000),
  spamShortWindowMs: parsePositiveInt(process.env.CHAT_SPAM_SHORT_WINDOW_MS, 8_000),
  spamShortWindowLimit: parsePositiveInt(process.env.CHAT_SPAM_SHORT_WINDOW_LIMIT, 5),
  spamMediumWindowMs: parsePositiveInt(process.env.CHAT_SPAM_MEDIUM_WINDOW_MS, 20_000),
  spamMediumWindowLimit: parsePositiveInt(process.env.CHAT_SPAM_MEDIUM_WINDOW_LIMIT, 8),
  spamLongWindowMs: parsePositiveInt(process.env.CHAT_SPAM_LONG_WINDOW_MS, 45_000),
  spamLongWindowLimit: parsePositiveInt(process.env.CHAT_SPAM_LONG_WINDOW_LIMIT, 12),
  spamShortCooldownMs: parsePositiveInt(process.env.CHAT_SPAM_SHORT_COOLDOWN_MS, 15_000),
  spamMediumCooldownMs: parsePositiveInt(process.env.CHAT_SPAM_MEDIUM_COOLDOWN_MS, 45_000),
  spamLongCooldownMs: parsePositiveInt(process.env.CHAT_SPAM_LONG_COOLDOWN_MS, 120_000),
  defaultGroupMessageCooldownMs: parsePositiveInt(process.env.CHAT_DEFAULT_GROUP_MESSAGE_COOLDOWN_MS, 1_000),
  maxGroupMessageCooldownMs: parsePositiveInt(process.env.CHAT_MAX_GROUP_MESSAGE_COOLDOWN_MS, 60_000),
  duplicateMessageWindowMs: parsePositiveInt(process.env.CHAT_DUPLICATE_MESSAGE_WINDOW_MS, 5_000)
} as const;

export const APP_LIMITS = {
  passwordResetTtlMs: parsePositiveInt(process.env.APP_PASSWORD_RESET_TTL_MS, 30 * 60 * 1000),
  sessionTtlMs: parsePositiveInt(process.env.APP_SESSION_TTL_MS, 30 * 24 * 60 * 60 * 1000),
  profileAvatarMaxBytes: parsePositiveInt(process.env.APP_AVATAR_MAX_BYTES, 2 * 1024 * 1024),
  profileFirstNameMax: 64,
  profileLastNameMax: 64,
  profileBioMax: 280,
  discoverPageSize: parsePositiveInt(process.env.APP_DISCOVER_PAGE_SIZE, 60),
  registerIpWindowMs: parsePositiveInt(process.env.APP_REGISTER_IP_WINDOW_MS, 10 * 60 * 1000),
  registerIpLimit: parsePositiveInt(process.env.APP_REGISTER_IP_LIMIT, 4),
  registerIpDailyLimit: parsePositiveInt(process.env.APP_REGISTER_IP_DAILY_LIMIT, 8),
  maxAccountsPerIp: parsePositiveInt(process.env.APP_MAX_ACCOUNTS_PER_IP, 10),
  loginIpWindowMs: parsePositiveInt(process.env.APP_LOGIN_IP_WINDOW_MS, 10 * 60 * 1000),
  loginIpLimit: parsePositiveInt(process.env.APP_LOGIN_IP_LIMIT, 25),
  loginIpBurstWindowMs: parsePositiveInt(process.env.APP_LOGIN_IP_BURST_WINDOW_MS, 60 * 1000),
  loginIpBurstLimit: parsePositiveInt(process.env.APP_LOGIN_IP_BURST_LIMIT, 8),
  resetIpWindowMs: parsePositiveInt(process.env.APP_RESET_IP_WINDOW_MS, 10 * 60 * 1000),
  resetIpLimit: parsePositiveInt(process.env.APP_RESET_IP_LIMIT, 12),
  abuseStrikeWindowMs: parsePositiveInt(process.env.APP_ABUSE_STRIKE_WINDOW_MS, 60 * 60 * 1000),
  abuseStrikeAutoBlockThreshold: parsePositiveInt(process.env.APP_ABUSE_STRIKE_AUTO_BLOCK_THRESHOLD, 20),
  abuseCooldownMs: parsePositiveInt(process.env.APP_ABUSE_COOLDOWN_MS, 24 * 60 * 60 * 1000)
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
