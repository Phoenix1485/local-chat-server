import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { APP_LIMITS, CHAT_LIMITS, GLOBAL_CHAT_ID } from '@/lib/config';
import {
  assertGroupCapability,
  canManageRole,
  hasGroupCapability,
  isGroupMemberRole,
  PermissionDeniedError,
  type GroupCapability,
  type GroupPermissionContext
} from '@/lib/groupPermissions';
import { ensureMysqlSchema, getMysqlPool } from '@/lib/mysql';
import { rateLimiter } from '@/lib/rateLimiter';
import { createSessionToken, hashPassword, hashToken, normalizeEmail, normalizeUsername, verifyPassword } from '@/lib/security';
import { normalizeName } from '@/lib/validation';
import type {
  AppChatAttachment,
  AppBootstrap,
  AppChatContext,
  AppChatGif,
  AppChatReadReceipt,
  AppGroupSettings,
  AppChatMember,
  AppChatMessage,
  AppChatPoll,
  AppChatReaction,
  AppChatSummary,
  AppModerationLog,
  AppModerationReport,
  AppModerationReportReason,
  AppModerationReportStatus,
  AppNicknameSlot,
  AppUserProfile,
  ChatBackgroundPreset,
  FriendRequestItem,
  GlobalRole,
  GroupInviteMode,
  GroupInvitePolicy,
  GroupMentionPolicy,
  GroupMemberRole,
  NicknameScope
} from '@/types/social';

type AccountRow = RowDataPacket & {
  user_id: string;
  username: string;
  username_norm: string;
  email: string | null;
  email_norm: string | null;
  password_hash: string;
  first_name: string;
  last_name: string;
  bio: string;
  global_role: GlobalRole;
  accent_color: string;
  chat_background: ChatBackgroundPreset;
  avatar_updated_at: number | null;
  created_at: number;
  updated_at: number;
};

type SessionRow = RowDataPacket & {
  id: string;
  user_id: string;
  expires_at: number;
  last_seen_at: number;
};

type CountRow = RowDataPacket & {
  total: number;
};

type ChatSummaryRow = RowDataPacket & {
  id: string;
  name: string;
  created_by: string | null;
  created_at: number;
  updated_at: number;
  chat_type: 'global' | 'group' | 'direct';
  group_invite_mode: GroupInviteMode;
  group_invite_policy: GroupInvitePolicy;
  group_everyone_mention_policy: GroupMentionPolicy;
  group_here_mention_policy: GroupMentionPolicy;
  group_invite_code: string | null;
  group_auto_hide_24h: number;
  members_count: number;
  member_role: GroupMemberRole | null;
  last_message_at: number | null;
  last_message_text: string | null;
  unread_count: number;
  mention_count: number;
};

type GroupChatControlRow = RowDataPacket & {
  id: string;
  chat_type: 'global' | 'group' | 'direct';
  created_by: string | null;
  deactivated_at: number | null;
  group_invite_mode: GroupInviteMode;
  group_invite_policy: GroupInvitePolicy;
  group_everyone_mention_policy: GroupMentionPolicy;
  group_here_mention_policy: GroupMentionPolicy;
  group_invite_code: string | null;
  group_auto_hide_24h: number;
  group_message_cooldown_ms: number;
};

type GroupPermissionState = {
  chat: GroupChatControlRow;
  context: GroupPermissionContext;
};

type ChatMemberRow = RowDataPacket & {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  bio: string;
  email: string | null;
  global_role: GlobalRole;
  accent_color: string;
  chat_background: ChatBackgroundPreset;
  avatar_updated_at: number | null;
  joined_at: number;
  member_role: GroupMemberRole;
  is_online: number;
  muted_until: number | null;
  mute_reason: string | null;
  banned_at: number | null;
  ban_reason: string | null;
};

type ChatMemberProfileRow = RowDataPacket & {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  bio: string;
  email: string | null;
  global_role: GlobalRole;
  accent_color: string;
  chat_background: ChatBackgroundPreset;
  avatar_updated_at: number | null;
};

type MessageRow = RowDataPacket & {
  id: string;
  chat_id: string;
  user_id: string;
  text: string;
  created_at: number;
  attachments_json: string | null;
  username: string;
  first_name: string;
  last_name: string;
  bio: string;
  email: string | null;
  global_role: GlobalRole;
  accent_color: string;
  chat_background: ChatBackgroundPreset;
  avatar_updated_at: number | null;
};

type FriendProfileRow = RowDataPacket & {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  bio: string;
  email: string | null;
  global_role: GlobalRole;
  accent_color: string;
  chat_background: ChatBackgroundPreset;
  avatar_updated_at: number | null;
};

type BlacklistEntryRow = RowDataPacket & {
  id: string;
  kind: 'name' | 'email';
  value: string;
  value_norm: string;
  note: string | null;
  created_at: number;
  updated_at: number;
};

type IpBlacklistEntryRow = RowDataPacket & {
  id: string;
  ip_norm: string;
  note: string | null;
  forbid_register: number;
  forbid_login: number;
  forbid_reset: number;
  forbid_chat: number;
  terminate_sessions: number;
  created_at: number;
  updated_at: number;
};

type IpAbuseFlagRow = RowDataPacket & {
  ip_norm: string;
  strikes: number;
  blocked_until: number | null;
  last_reason: string | null;
  created_at: number;
  updated_at: number;
};

type MessageSpamBlockRow = RowDataPacket & {
  blocked_until: number;
  strike_count: number;
  last_triggered_at: number;
};

type GroupModerationLogRow = RowDataPacket & {
  id: string;
  chat_id: string;
  action: string;
  actor_user_id: string;
  actor_username: string;
  actor_first_name: string;
  actor_last_name: string;
  target_user_id: string | null;
  target_username: string | null;
  target_first_name: string | null;
  target_last_name: string | null;
  message_id: string | null;
  details_json: string | null;
  created_at: number;
};

type ModerationReportRow = RowDataPacket & {
  id: string;
  chat_id: string;
  status: AppModerationReportStatus;
  reason: AppModerationReportReason;
  reporter_user_id: string;
  reporter_username: string;
  reporter_first_name: string;
  reporter_last_name: string;
  target_user_id: string | null;
  target_username: string | null;
  target_first_name: string | null;
  target_last_name: string | null;
  message_id: string | null;
  message_text: string | null;
  notes: string | null;
  decision_notes: string | null;
  decided_by_user_id: string | null;
  decided_by_username: string | null;
  decided_by_first_name: string | null;
  decided_by_last_name: string | null;
  decided_at: number | null;
  created_at: number;
  updated_at: number;
};

type GroupMemberRestrictionRow = RowDataPacket & {
  chat_id: string;
  user_id: string;
  muted_until: number | null;
  mute_reason: string | null;
  banned_at: number | null;
  banned_by_user_id: string | null;
  ban_reason: string | null;
  created_at: number;
  updated_at: number;
};

type FriendRequestRow = RowDataPacket & {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: number;
  updated_at: number;
  sender_username: string;
  sender_first_name: string;
  sender_last_name: string;
  sender_bio: string;
  sender_email: string | null;
  sender_role: GlobalRole;
  sender_avatar_updated_at: number | null;
  receiver_username: string;
  receiver_first_name: string;
  receiver_last_name: string;
  receiver_bio: string;
  receiver_email: string | null;
  receiver_role: GlobalRole;
  receiver_avatar_updated_at: number | null;
};

type ProfileWithFriendRow = FriendProfileRow & {
  is_friend: number;
};

type NicknameSlotRow = RowDataPacket & {
  id: string;
  user_id: string;
  nickname: string;
  nickname_norm: string;
  scope: NicknameScope;
  chat_id: string | null;
  chat_name: string | null;
  created_at: number;
  updated_at: number;
};

type AccountLookupRow = AccountRow & {
  user_name: string;
  user_status: string;
};

type UploadRow = RowDataPacket & {
  id: string;
  chat_id: string;
  file_name: string;
  mime_type: string;
  size: number;
  uploaded_by: string;
  uploaded_at: number;
  buffer: Buffer;
};

type StoredPollOption = {
  id: string;
  text: string;
  voterIds: string[];
};

type StoredMessageMeta = {
  attachments?: AppChatAttachment[];
  gif?: AppChatGif | null;
  replyTo?: {
    id: string;
    authorName: string;
    textSnippet: string;
  } | null;
  poll?: {
    question: string;
    options: StoredPollOption[];
    closed?: boolean;
  } | null;
  reactions?: Record<string, string[]>;
  mentionUserIds?: string[];
  hiddenForUserIds?: string[];
  editedAt?: number | null;
  deletedForAll?: {
    by: string;
    at: number;
  } | null;
  pinned?: {
    by: string;
    at: number;
  } | null;
};

type AddMessageInput = {
  text?: string;
  attachmentIds?: string[];
  replyToMessageId?: string | null;
  gif?: {
    url: string;
    previewUrl?: string | null;
    tenorId?: string | null;
    title?: string | null;
  } | null;
  poll?: {
    question: string;
    options: string[];
  } | null;
};

type BlacklistKind = 'name' | 'email';

type BlacklistEntry = {
  id: string;
  kind: BlacklistKind;
  value: string;
  note: string | null;
  createdAt: number;
  updatedAt: number;
};

type BlacklistMatch = {
  kind: BlacklistKind;
  value: string;
};

type IpRestrictionScope = {
  forbidRegister: boolean;
  forbidLogin: boolean;
  forbidReset: boolean;
  forbidChat: boolean;
  terminateSessions: boolean;
};

type IpBlacklistEntry = {
  id: string;
  ip: string;
  note: string | null;
  scope: IpRestrictionScope;
  createdAt: number;
  updatedAt: number;
};

type IpAbuseFlag = {
  ip: string;
  strikes: number;
  blockedUntil: number | null;
  lastReason: string | null;
  updatedAt: number;
};

export class MessageSpamError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    super(`Du sendest gerade zu schnell. Warte bitte ${retryAfterSeconds}s.`);
    this.name = 'MessageSpamError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class MessageCooldownError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    super(`Bitte warte ${retryAfterSeconds}s, bevor du erneut in diese Gruppe schreibst.`);
    this.name = 'MessageCooldownError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class GroupMutedError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    super(`Du bist in dieser Gruppe stummgeschaltet. Versuche es in ${retryAfterSeconds}s erneut.`);
    this.name = 'GroupMutedError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class IpRestrictedError extends Error {
  readonly statusCode: number;
  readonly retryAfterMs: number | null;

  constructor(message: string, statusCode = 403, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'IpRestrictedError';
    this.statusCode = statusCode;
    this.retryAfterMs = retryAfterMs;
  }
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const n = asNumber(value, Number.NaN);
  return Number.isFinite(n) ? n : null;
}

function sortFriendPair(a: string, b: string): { low: string; high: string } {
  return a < b ? { low: a, high: b } : { low: b, high: a };
}

function normalizeIds(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function normalizeBlacklistValue(kind: BlacklistKind, value: string): string {
  const trimmed = value.trim();
  if (kind === 'email') {
    return normalizeEmail(trimmed);
  }
  return trimmed.replace(/\s+/g, ' ').toLowerCase();
}

function normalizeBlacklistNameCandidates(values: Array<string | null | undefined>): string[] {
  const normalized = values
    .map((value) => value?.trim() ?? '')
    .filter((value) => value.length > 0)
    .map((value) => normalizeBlacklistValue('name', value));
  return [...new Set(normalized)];
}

function normalizeIp(value: string): string {
  return value.trim().toLowerCase().slice(0, 128);
}

function normalizeDisplayName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function simplifyNameFingerprint(value: string): string {
  return normalizeDisplayName(value)
    .replace(/[0-9]/g, '')
    .replace(/(.)\1+/g, '$1')
    .replace(/\s+/g, '');
}

function mapBlacklistEntry(row: BlacklistEntryRow): BlacklistEntry {
  return {
    id: row.id,
    kind: row.kind,
    value: row.value,
    note: row.note,
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at)
  };
}

function normalizeGroupMessageCooldownMs(value: number): number {
  return Math.max(0, Math.min(CHAT_LIMITS.maxGroupMessageCooldownMs, Math.floor(value)));
}

function mapIpBlacklistEntry(row: IpBlacklistEntryRow): IpBlacklistEntry {
  return {
    id: row.id,
    ip: row.ip_norm,
    note: row.note,
    scope: {
      forbidRegister: asNumber(row.forbid_register, 0) > 0,
      forbidLogin: asNumber(row.forbid_login, 0) > 0,
      forbidReset: asNumber(row.forbid_reset, 0) > 0,
      forbidChat: asNumber(row.forbid_chat, 0) > 0,
      terminateSessions: asNumber(row.terminate_sessions, 0) > 0
    },
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at)
  };
}

function mapIpAbuseFlag(row: IpAbuseFlagRow): IpAbuseFlag {
  return {
    ip: row.ip_norm,
    strikes: asNumber(row.strikes, 0),
    blockedUntil: asNullableNumber(row.blocked_until),
    lastReason: row.last_reason ?? null,
    updatedAt: asNumber(row.updated_at, 0)
  };
}

function toGroupInviteMode(value: unknown): GroupInviteMode {
  return value === 'invite_link' ? 'invite_link' : 'direct';
}

function toGroupInvitePolicy(value: unknown): GroupInvitePolicy {
  if (value === 'everyone' || value === 'owner') {
    return value;
  }
  return 'admins';
}

function toGroupMentionPolicy(value: unknown): GroupMentionPolicy {
  if (value === 'everyone' || value === 'owner') {
    return value;
  }
  return 'admins';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasMentionToken(text: string, token: 'everyone' | 'here'): boolean {
  const pattern = token === 'everyone' ? '(?:everyone|everone)' : token;
  const regex = new RegExp(`(^|\\s)@${pattern}(?=$|\\s|[.,!?;:])`, 'i');
  return regex.test(text);
}

function hasUserMention(text: string, username: string): boolean {
  const safe = escapeRegExp(username.trim());
  if (!safe) {
    return false;
  }
  const regex = new RegExp(`(^|\\s)@${safe}(?=$|\\s|[.,!?;:])`, 'i');
  return regex.test(text);
}

function hasFullNameMention(text: string, fullName: string): boolean {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => escapeRegExp(part));
  if (parts.length === 0) {
    return false;
  }
  const regex = new RegExp(`(^|\\s)@${parts.join('\\s+')}(?=$|\\s|[.,!?;:])`, 'i');
  return regex.test(text);
}

function createGroupInviteCode(): string {
  return randomUUID().replace(/-/g, '').slice(0, 18);
}

function mapProfile(
  row: {
    user_id: string;
    username: string;
    first_name: string;
    last_name: string;
    bio: string;
    email: string | null;
    global_role: GlobalRole;
    accent_color: string;
    chat_background: ChatBackgroundPreset;
    avatar_updated_at: number | null;
  },
  options?: { includeEmail?: boolean; isFriend?: boolean; displayName?: string; nicknameSlots?: AppNicknameSlot[] }
): AppUserProfile {
  const first = row.first_name ?? '';
  const last = row.last_name ?? '';
  const legalName = `${first} ${last}`.trim() || row.username;
  const fullName = options?.displayName?.trim() || legalName;

  return {
    id: row.user_id,
    username: row.username,
    firstName: first,
    lastName: last,
    fullName,
    legalName,
    bio: row.bio ?? '',
    email: options?.includeEmail ? row.email : null,
    avatarUpdatedAt: asNullableNumber(row.avatar_updated_at),
    role: row.global_role,
    accentColor: (row.accent_color ?? '').trim() || '#38bdf8',
    chatBackground: toChatBackgroundPreset(row.chat_background),
    nicknameSlots: options?.nicknameSlots,
    isFriend: options?.isFriend
  };
}

function fullNameFromParts(username: string | null, firstName: string | null, lastName: string | null): string {
  return `${firstName ?? ''} ${lastName ?? ''}`.trim() || String(username ?? '').trim() || 'Unbekannt';
}

function toModerationReportStatus(value: unknown): AppModerationReportStatus {
  if (value === 'reviewing' || value === 'resolved' || value === 'dismissed') {
    return value;
  }
  return 'open';
}

function toModerationReportReason(value: unknown): AppModerationReportReason {
  if (
    value === 'spam' ||
    value === 'harassment' ||
    value === 'hate' ||
    value === 'violence' ||
    value === 'sexual' ||
    value === 'impersonation' ||
    value === 'privacy'
  ) {
    return value;
  }
  return 'other';
}

function normalizeAttachment(value: unknown): AppChatAttachment | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const fileName = typeof row.fileName === 'string' ? row.fileName.trim() : '';
  const mimeType = typeof row.mimeType === 'string' ? row.mimeType.trim() : '';
  const size = asNumber(row.size, 0);
  const uploadedAt = asNumber(row.uploadedAt, 0);
  const uploadedBy = typeof row.uploadedBy === 'string' ? row.uploadedBy.trim() : '';

  if (!id || !fileName || !mimeType || size <= 0 || uploadedAt <= 0 || !uploadedBy) {
    return null;
  }

  return {
    id,
    fileName,
    mimeType,
    size,
    uploadedAt,
    uploadedBy
  };
}

const CHAT_BACKGROUND_PRESETS: ChatBackgroundPreset[] = ['aurora', 'sunset', 'midnight', 'forest', 'paper'];

function toChatBackgroundPreset(value: unknown): ChatBackgroundPreset {
  return CHAT_BACKGROUND_PRESETS.includes(value as ChatBackgroundPreset) ? (value as ChatBackgroundPreset) : 'aurora';
}

function normalizeGif(value: unknown): AppChatGif | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Record<string, unknown>;
  const url = typeof row.url === 'string' ? row.url.trim() : '';
  if (!url) {
    return null;
  }

  return {
    url,
    previewUrl: typeof row.previewUrl === 'string' && row.previewUrl.trim() ? row.previewUrl.trim() : null,
    tenorId: typeof row.tenorId === 'string' && row.tenorId.trim() ? row.tenorId.trim() : null,
    title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : null
  };
}

function normalizePoll(value: unknown): StoredMessageMeta['poll'] {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const row = value as Record<string, unknown>;
  const question = typeof row.question === 'string' ? row.question.trim() : '';
  const optionsRaw = Array.isArray(row.options) ? row.options : [];
  if (!question || optionsRaw.length < 2) {
    return null;
  }

  const options: StoredPollOption[] = [];
  for (const optionRaw of optionsRaw) {
    if (!optionRaw || typeof optionRaw !== 'object') {
      continue;
    }
    const optionRow = optionRaw as Record<string, unknown>;
    const id = typeof optionRow.id === 'string' ? optionRow.id.trim() : '';
    const text = typeof optionRow.text === 'string' ? optionRow.text.trim() : '';
    const voterIds = Array.isArray(optionRow.voterIds)
      ? [...new Set(optionRow.voterIds.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0))]
      : [];
    if (!id || !text) {
      continue;
    }
    options.push({ id, text, voterIds });
  }

  if (options.length < 2) {
    return null;
  }

  return {
    question,
    options,
    closed: row.closed === true
  };
}

function normalizeReactions(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const out: Record<string, string[]> = {};
  for (const [emoji, voters] of Object.entries(value as Record<string, unknown>)) {
    if (!emoji.trim() || !Array.isArray(voters)) {
      continue;
    }
    const voterIds = [...new Set(voters.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0))];
    if (voterIds.length > 0) {
      out[emoji] = voterIds;
    }
  }
  return out;
}

function parseMessageMeta(raw: string | null): StoredMessageMeta {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const attachmentsRaw = Array.isArray(parsed.attachments) ? parsed.attachments : [];
    const attachments = attachmentsRaw.map(normalizeAttachment).filter((entry): entry is AppChatAttachment => Boolean(entry));
    const gif = normalizeGif(parsed.gif);
    const poll = normalizePoll(parsed.poll);
    const reactions = normalizeReactions(parsed.reactions);
    const mentionUserIds = Array.isArray(parsed.mentionUserIds)
      ? [...new Set(parsed.mentionUserIds.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0))]
      : [];
    const hiddenForUserIds = Array.isArray(parsed.hiddenForUserIds)
      ? [...new Set(parsed.hiddenForUserIds.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0))]
      : [];
    const editedAt = parsed.editedAt ? asNumber(parsed.editedAt, 0) : null;
    const deletedForAll = parsed.deletedForAll && typeof parsed.deletedForAll === 'object'
      ? {
          by: typeof (parsed.deletedForAll as Record<string, unknown>).by === 'string'
            ? String((parsed.deletedForAll as Record<string, unknown>).by).trim()
            : '',
          at: asNumber((parsed.deletedForAll as Record<string, unknown>).at, 0)
        }
      : null;
    const replyTo = parsed.replyTo && typeof parsed.replyTo === 'object'
      ? {
          id: typeof (parsed.replyTo as Record<string, unknown>).id === 'string'
            ? String((parsed.replyTo as Record<string, unknown>).id).trim()
            : '',
          authorName: typeof (parsed.replyTo as Record<string, unknown>).authorName === 'string'
            ? String((parsed.replyTo as Record<string, unknown>).authorName).trim()
            : '',
          textSnippet: typeof (parsed.replyTo as Record<string, unknown>).textSnippet === 'string'
            ? String((parsed.replyTo as Record<string, unknown>).textSnippet).trim()
            : ''
        }
      : null;

    return {
      attachments,
      gif,
      poll,
      reactions,
      mentionUserIds,
      hiddenForUserIds,
      editedAt: editedAt && editedAt > 0 ? editedAt : null,
      deletedForAll: deletedForAll && deletedForAll.by && deletedForAll.at > 0 ? deletedForAll : null,
      replyTo: replyTo && replyTo.id ? replyTo : null
    };
  } catch {
    return {};
  }
}

function buildReactions(meta: StoredMessageMeta, viewerUserId: string): AppChatReaction[] {
  const reactions = meta.reactions ?? {};
  return Object.entries(reactions)
    .map(([emoji, voterIds]) => ({
      emoji,
      count: voterIds.length,
      reactedByMe: voterIds.includes(viewerUserId)
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}

function buildPoll(meta: StoredMessageMeta, viewerUserId: string): AppChatPoll | null {
  if (!meta.poll) {
    return null;
  }

  return {
    question: meta.poll.question,
    closed: meta.poll.closed === true,
    options: meta.poll.options.map((option) => ({
      id: option.id,
      text: option.text,
      votes: option.voterIds.length,
      votedByMe: option.voterIds.includes(viewerUserId)
    }))
  };
}

function buildMessage(row: MessageRow, viewerUserId: string, readBy: AppChatReadReceipt[] = []): AppChatMessage | null {
  const meta = parseMessageMeta(row.attachments_json);
  const hidden = meta.hiddenForUserIds ?? [];
  if (hidden.includes(viewerUserId)) {
    return null;
  }
  const deletedForAll = Boolean(meta.deletedForAll);
  const pinned = meta.pinned ?? null;
  const userProfile = mapProfile(row);
  return {
    id: row.id,
    chatId: row.chat_id,
    user: userProfile,
    text: deletedForAll ? '' : row.text,
    createdAt: asNumber(row.created_at),
    editedAt: meta.editedAt ?? null,
    deletedForAll,
    replyTo: meta.replyTo
      ? {
          messageId: meta.replyTo.id,
          authorName: meta.replyTo.authorName,
          textSnippet: meta.replyTo.textSnippet
        }
      : null,
    attachments: deletedForAll ? [] : meta.attachments ?? [],
    gif: deletedForAll ? null : meta.gif ?? null,
    poll: deletedForAll ? null : buildPoll(meta, viewerUserId),
    reactions: deletedForAll ? [] : buildReactions(meta, viewerUserId),
    isPinned: Boolean(pinned),
    pinnedAt: pinned?.at ?? null,
    pinnedBy: pinned?.by ?? null,
    mentionedMe: !deletedForAll && (meta.mentionUserIds ?? []).includes(viewerUserId),
    readBy: deletedForAll ? [] : readBy
  };
}

function mapNicknameSlot(row: NicknameSlotRow): AppNicknameSlot {
  return {
    id: row.id,
    nickname: row.nickname,
    scope: row.scope,
    chatId: row.chat_id ?? null,
    chatName: row.chat_name?.trim() || null
  };
}

export type UserSessionContext = {
  sessionId: string;
  tokenExpiresAt: number;
  user: AppUserProfile;
};

export class SocialStore {
  private readonly typingTtlMs = 6_000;
  private readonly typingByChat = new Map<string, Map<string, number>>();

  private async ensureReady(): Promise<void> {
    await ensureMysqlSchema();
  }

  private async getAccountByUserId(userId: string): Promise<AccountRow | null> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<AccountRow[]>(
      `
        SELECT
          user_id,
          username,
          username_norm,
          email,
          email_norm,
          password_hash,
          first_name,
          last_name,
          bio,
          global_role,
          accent_color,
          chat_background,
          avatar_updated_at,
          created_at,
          updated_at
        FROM auth_accounts
        WHERE user_id = ?
        LIMIT 1
      `,
      [userId]
    );

    return rows[0] ?? null;
  }

  private async getAccountByIdentifier(identifier: string): Promise<AccountLookupRow | null> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const normalized = normalizeUsername(identifier);
    const email = normalizeEmail(identifier);

    const [rows] = await pool.query<AccountLookupRow[]>(
      `
        SELECT
          a.user_id,
          a.username,
          a.username_norm,
          a.email,
          a.email_norm,
          a.password_hash,
          a.first_name,
          a.last_name,
          a.bio,
          a.global_role,
          a.accent_color,
          a.chat_background,
          a.avatar_updated_at,
          a.created_at,
          a.updated_at,
          u.name AS user_name,
          u.status AS user_status
        FROM auth_accounts a
        JOIN users u ON u.id = a.user_id
        WHERE a.username_norm = ? OR a.email_norm = ?
        LIMIT 1
      `,
      [normalized, email]
    );

    return rows[0] ?? null;
  }

  private async findBlacklistMatch(options: {
    names?: Array<string | null | undefined>;
    email?: string | null | undefined;
  }): Promise<BlacklistMatch | null> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const checks: Array<{ kind: BlacklistKind; value: string }> = [];

    for (const value of normalizeBlacklistNameCandidates(options.names ?? [])) {
      checks.push({ kind: 'name', value });
    }

    const normalizedEmail = options.email?.trim() ? normalizeBlacklistValue('email', options.email) : '';
    if (normalizedEmail) {
      checks.push({ kind: 'email', value: normalizedEmail });
    }

    if (checks.length === 0) {
      return null;
    }

    const conditions = checks.map(() => '(kind = ? AND value_norm = ?)').join(' OR ');
    const params = checks.flatMap((entry) => [entry.kind, entry.value]);
    const [rows] = await pool.query<BlacklistEntryRow[]>(
      `
        SELECT id, kind, value, value_norm, note, created_at, updated_at
        FROM app_blacklist_entries
        WHERE ${conditions}
        LIMIT 1
      `,
      params
    );

    const row = rows[0];
    return row ? { kind: row.kind, value: row.value } : null;
  }

  private async assertAllowedIdentity(options: {
    username?: string | null | undefined;
    firstName?: string | null | undefined;
    lastName?: string | null | undefined;
    email?: string | null | undefined;
  }): Promise<void> {
    const fullName = `${options.firstName?.trim() ?? ''} ${options.lastName?.trim() ?? ''}`.trim();
    const match = await this.findBlacklistMatch({
      names: [options.username, options.firstName, options.lastName, fullName],
      email: options.email
    });

    if (!match) {
      return;
    }

    if (match.kind === 'email') {
      throw new Error('Diese E-Mail-Adresse ist gesperrt.');
    }
    throw new Error('Dieser Name ist gesperrt.');
  }

  private async assertAccountAllowed(account: {
    username: string;
    first_name: string;
    last_name: string;
    email: string | null;
  }): Promise<void> {
    await this.assertAllowedIdentity({
      username: account.username,
      firstName: account.first_name,
      lastName: account.last_name,
      email: account.email
    });
  }

  private async getIpBlacklistEntry(ip: string): Promise<IpBlacklistEntryRow | null> {
    await this.ensureReady();
    const ipNorm = normalizeIp(ip);
    if (!ipNorm || ipNorm === 'unknown') {
      return null;
    }
    const pool = getMysqlPool();
    const [rows] = await pool.query<IpBlacklistEntryRow[]>(
      `
        SELECT id, ip_norm, note, forbid_register, forbid_login, forbid_reset, forbid_chat, terminate_sessions, created_at, updated_at
        FROM app_ip_blacklist_entries
        WHERE ip_norm = ?
        LIMIT 1
      `,
      [ipNorm]
    );
    return rows[0] ?? null;
  }

  private async terminateSessionsForIp(ip: string): Promise<void> {
    await this.ensureReady();
    const ipNorm = normalizeIp(ip);
    if (!ipNorm || ipNorm === 'unknown') {
      return;
    }
    const pool = getMysqlPool();
    await pool.query<ResultSetHeader>(
      `
        DELETE s
        FROM auth_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE LOWER(u.ip) = ?
      `,
      [ipNorm]
    );
  }

  private async assertIpAllowed(ip: string, action: 'register' | 'login' | 'reset' | 'chat'): Promise<void> {
    const entry = await this.getIpBlacklistEntry(ip);
    if (!entry) {
      return;
    }
    const scope = mapIpBlacklistEntry(entry).scope;
    const blocked =
      (action === 'register' && scope.forbidRegister) ||
      (action === 'login' && scope.forbidLogin) ||
      (action === 'reset' && scope.forbidReset) ||
      (action === 'chat' && scope.forbidChat);
    if (!blocked) {
      return;
    }
    if (scope.terminateSessions) {
      await this.terminateSessionsForIp(ip);
    }
    throw new IpRestrictedError('Diese IP-Adresse ist für diese Aktion gesperrt.', 403);
  }

  private async registerIpAbuse(ip: string, reason: string, strikeDelta = 1): Promise<void> {
    await this.ensureReady();
    const ipNorm = normalizeIp(ip);
    if (!ipNorm || ipNorm === 'unknown') {
      return;
    }
    const pool = getMysqlPool();
    const now = Date.now();
    const windowStart = now - APP_LIMITS.abuseStrikeWindowMs;
    const [rows] = await pool.query<IpAbuseFlagRow[]>(
      `
        SELECT ip_norm, strikes, blocked_until, last_reason, created_at, updated_at
        FROM app_ip_abuse_flags
        WHERE ip_norm = ?
        LIMIT 1
      `,
      [ipNorm]
    );
    const existing = rows[0] ?? null;
    const nextStrikes = existing && asNumber(existing.updated_at, 0) >= windowStart
      ? asNumber(existing.strikes, 0) + Math.max(1, strikeDelta)
      : Math.max(1, strikeDelta);
    const blockedUntil = nextStrikes >= APP_LIMITS.abuseStrikeAutoBlockThreshold ? now + APP_LIMITS.abuseCooldownMs : null;

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO app_ip_abuse_flags (ip_norm, strikes, blocked_until, last_reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          strikes = VALUES(strikes),
          blocked_until = VALUES(blocked_until),
          last_reason = VALUES(last_reason),
          updated_at = VALUES(updated_at)
      `,
      [ipNorm, nextStrikes, blockedUntil, reason.slice(0, 120), now, now]
    );

    if (blockedUntil) {
      await this.addIpBlacklistEntry(
        ipNorm,
        {
          forbidRegister: true,
          forbidLogin: true,
          forbidReset: true,
          forbidChat: true,
          terminateSessions: true
        },
        `Auto block: ${reason.slice(0, 80)}`
      );
      await this.terminateSessionsForIp(ipNorm);
    }
  }

  private async enforceIpRateLimit(
    ip: string,
    keySuffix: string,
    limit: number,
    windowMs: number,
    reason: string
  ): Promise<void> {
    const ipNorm = normalizeIp(ip);
    if (!ipNorm || ipNorm === 'unknown') {
      return;
    }
    const result = await rateLimiter.check(`ip:${ipNorm}:${keySuffix}`, limit, windowMs);
    if (result.ok) {
      return;
    }
    await this.registerIpAbuse(ipNorm, reason, 2);
    throw new IpRestrictedError('Zu viele Anfragen von dieser IP-Adresse. Bitte warte kurz.', 429, result.resetInMs);
  }

  private async cleanupExpiredSessions(now = Date.now()): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();
    await pool.query<ResultSetHeader>('DELETE FROM auth_sessions WHERE expires_at <= ?', [now]);
  }

  private async cleanupExpiredResets(now = Date.now()): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();
    await pool.query<ResultSetHeader>(
      'DELETE FROM password_reset_tokens WHERE expires_at <= ? OR (used_at IS NOT NULL AND used_at <= ?)',
      [now, now - 24 * 60 * 60 * 1000]
    );
  }

  private async buildSession(userId: string, sessionId: string, expiresAt: number): Promise<UserSessionContext> {
    const account = await this.getAccountByUserId(userId);
    if (!account) {
      throw new Error('Account not found.');
    }

    return {
      sessionId,
      tokenExpiresAt: expiresAt,
      user: mapProfile(account, { includeEmail: true })
    };
  }

  private async createSession(userId: string, userAgent: string): Promise<{ token: string; session: UserSessionContext }> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    const token = createSessionToken();
    const tokenHash = hashToken(token);
    const sessionId = randomUUID();
    const expiresAt = now + APP_LIMITS.sessionTtlMs;

    await this.cleanupExpiredSessions(now);

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [sessionId, userId, tokenHash, now, expiresAt, now, userAgent.slice(0, 255)]
    );

    const session = await this.buildSession(userId, sessionId, expiresAt);
    return { token, session };
  }

  private async ensureGlobalMembership(userId: string, now = Date.now()): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO chat_memberships (chat_id, user_id, joined_at, member_role, left_at)
        VALUES (?, ?, ?, 'member', NULL)
        ON DUPLICATE KEY UPDATE left_at = NULL
      `,
      [GLOBAL_CHAT_ID, userId, now]
    );
  }

  private cleanupTyping(now = Date.now()): void {
    for (const [chatId, map] of this.typingByChat.entries()) {
      for (const [userId, expiresAt] of map.entries()) {
        if (expiresAt <= now) {
          map.delete(userId);
        }
      }
      if (map.size === 0) {
        this.typingByChat.delete(chatId);
      }
    }
  }

  private async markChatRead(userId: string, chatId: string, lastReadAt = Date.now()): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO chat_reads (chat_id, user_id, last_read_at)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE last_read_at = GREATEST(last_read_at, VALUES(last_read_at))
      `,
      [chatId, userId, lastReadAt]
    );
  }

  private async getChatReadReceiptsByMessageId(
    chatId: string,
    messageRows: MessageRow[]
  ): Promise<Map<string, AppChatReadReceipt[]>> {
    const out = new Map<string, AppChatReadReceipt[]>();
    if (messageRows.length === 0) {
      return out;
    }

    const pool = getMysqlPool();
    const [readRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT user_id, last_read_at
        FROM chat_reads
        WHERE chat_id = ?
      `,
      [chatId]
    );
    const readAtByUserId = new Map<string, number>();
    for (const row of readRows) {
      const userId = String(row.user_id ?? '').trim();
      if (!userId) {
        continue;
      }
      readAtByUserId.set(userId, asNumber(row.last_read_at, 0));
    }

    if (readAtByUserId.size === 0) {
      for (const row of messageRows) {
        out.set(row.id, []);
      }
      return out;
    }

    const [memberRows] = await pool.query<ChatMemberProfileRow[]>(
      `
        SELECT
          a.user_id,
          a.username,
          a.first_name,
          a.last_name,
          a.bio,
          a.email,
          a.global_role,
          a.accent_color,
          a.chat_background,
          a.avatar_updated_at
        FROM chat_memberships cm
        JOIN auth_accounts a ON a.user_id = cm.user_id
        LEFT JOIN group_member_restrictions gmr
          ON gmr.chat_id = cm.chat_id
         AND gmr.user_id = cm.user_id
        WHERE cm.chat_id = ?
          AND cm.left_at IS NULL
      `,
      [chatId]
    );
    const memberByUserId = new Map<string, ReturnType<typeof mapProfile>>();
    for (const row of memberRows) {
      const userId = String(row.user_id ?? '').trim();
      if (!userId) {
        continue;
      }
      memberByUserId.set(userId, mapProfile(row));
    }

    for (const row of messageRows) {
      const createdAt = asNumber(row.created_at, 0);
      const receipts: AppChatReadReceipt[] = [];
      for (const [readerUserId, readAt] of readAtByUserId.entries()) {
        if (readerUserId === row.user_id || readAt < createdAt) {
          continue;
        }
        const member = memberByUserId.get(readerUserId);
        if (!member) {
          continue;
        }
        receipts.push({
          userId: member.id,
          fullName: member.fullName,
          username: member.username,
          avatarUpdatedAt: member.avatarUpdatedAt,
          readAt
        });
      }
      receipts.sort((a, b) => a.readAt - b.readAt || a.fullName.localeCompare(b.fullName));
      out.set(row.id, receipts);
    }

    return out;
  }

  private async mapRowsToMessages(rows: MessageRow[], viewerUserId: string): Promise<AppChatMessage[]> {
    if (rows.length === 0) {
      return [];
    }
    const [displayNames, receiptsByMessageId] = await Promise.all([
      this.loadResolvedNicknamesForChat(rows[0].chat_id, rows.map((row) => row.user_id)),
      this.getChatReadReceiptsByMessageId(rows[0].chat_id, rows)
    ]);
    return rows
      .map((row) => {
        const displayName = displayNames.get(row.user_id);
        return buildMessage(
          {
            ...row,
            first_name: displayName ?? row.first_name,
            last_name: displayName ? '' : row.last_name
          },
          viewerUserId,
          receiptsByMessageId.get(row.id) ?? []
        );
      })
      .filter((item): item is AppChatMessage => Boolean(item));
  }

  private async mapRowToMessage(row: MessageRow, viewerUserId: string): Promise<AppChatMessage | null> {
    const [receiptsByMessageId, displayNames] = await Promise.all([
      this.getChatReadReceiptsByMessageId(row.chat_id, [row]),
      this.loadResolvedNicknamesForChat(row.chat_id, [row.user_id])
    ]);
    const displayName = displayNames.get(row.user_id);
    return buildMessage(
      {
        ...row,
        first_name: displayName ?? row.first_name,
        last_name: displayName ? '' : row.last_name
      },
      viewerUserId,
      receiptsByMessageId.get(row.id) ?? []
    );
  }

  private async enforceMessageSpamProtection(userId: string, chatId: string, now = Date.now()): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [blockRows] = await pool.query<MessageSpamBlockRow[]>(
      `
        SELECT blocked_until, strike_count, last_triggered_at
        FROM message_spam_blocks
        WHERE user_id = ?
          AND chat_id = ?
        LIMIT 1
      `,
      [userId, chatId]
    );
    const currentBlock = blockRows[0];
    if (currentBlock && asNumber(currentBlock.blocked_until) > now) {
      throw new MessageSpamError(asNumber(currentBlock.blocked_until) - now);
    }

    const shortWindowStart = now - CHAT_LIMITS.spamShortWindowMs;
    const mediumWindowStart = now - CHAT_LIMITS.spamMediumWindowMs;
    const longWindowStart = now - CHAT_LIMITS.spamLongWindowMs;

    const [countRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS short_count,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS medium_count,
          SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS long_count
        FROM messages
        WHERE chat_id = ?
          AND user_id = ?
          AND created_at >= ?
      `,
      [shortWindowStart, mediumWindowStart, longWindowStart, chatId, userId, longWindowStart]
    );
    const counts = countRows[0] ?? {};
    const shortCount = asNumber(counts.short_count, 0);
    const mediumCount = asNumber(counts.medium_count, 0);
    const longCount = asNumber(counts.long_count, 0);

    let cooldownMs = 0;
    if (longCount >= CHAT_LIMITS.spamLongWindowLimit) {
      cooldownMs = CHAT_LIMITS.spamLongCooldownMs;
    } else if (mediumCount >= CHAT_LIMITS.spamMediumWindowLimit) {
      cooldownMs = CHAT_LIMITS.spamMediumCooldownMs;
    } else if (shortCount >= CHAT_LIMITS.spamShortWindowLimit) {
      cooldownMs = CHAT_LIMITS.spamShortCooldownMs;
    }

    if (cooldownMs <= 0) {
      if (currentBlock && asNumber(currentBlock.blocked_until) <= now) {
        await pool.query<ResultSetHeader>(
          'DELETE FROM message_spam_blocks WHERE user_id = ? AND chat_id = ? AND blocked_until <= ?',
          [userId, chatId, now]
        );
      }
      return;
    }

    const previousStrikeCount = currentBlock ? asNumber(currentBlock.strike_count, 0) : 0;
    const previousTriggeredAt = currentBlock ? asNumber(currentBlock.last_triggered_at, 0) : 0;
    const nextStrikeCount =
      previousTriggeredAt > 0 && now - previousTriggeredAt <= CHAT_LIMITS.spamLongWindowMs ? previousStrikeCount + 1 : 1;
    const escalatedCooldownMs = Math.min(
      CHAT_LIMITS.spamLongCooldownMs,
      cooldownMs + Math.max(0, nextStrikeCount - 1) * 10_000
    );
    const blockedUntil = now + escalatedCooldownMs;

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO message_spam_blocks (user_id, chat_id, blocked_until, strike_count, last_triggered_at)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          blocked_until = GREATEST(blocked_until, VALUES(blocked_until)),
          strike_count = VALUES(strike_count),
          last_triggered_at = VALUES(last_triggered_at)
      `,
      [userId, chatId, blockedUntil, nextStrikeCount, now]
    );

    throw new MessageSpamError(blockedUntil - now);
  }

  private async enforceGroupMessageCooldown(
    userId: string,
    chatId: string,
    chatType: 'global' | 'group' | 'direct',
    memberRole: GroupMemberRole,
    accountRole: GlobalRole,
    cooldownMs: number,
    now = Date.now()
  ): Promise<void> {
    if (chatType !== 'group') {
      return;
    }

    if (accountRole === 'admin' || accountRole === 'superadmin') {
      return;
    }

    if (memberRole === 'owner' || memberRole === 'admin') {
      return;
    }

    const effectiveCooldownMs = normalizeGroupMessageCooldownMs(cooldownMs);
    if (effectiveCooldownMs <= 0) {
      return;
    }

    const pool = getMysqlPool();
    const [rows] = await pool.query<RowDataPacket[]>(
      `
        SELECT created_at
        FROM messages
        WHERE chat_id = ?
          AND user_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [chatId, userId]
    );

    const lastCreatedAt = asNumber(rows[0]?.created_at, 0);
    if (!lastCreatedAt) {
      return;
    }

    const retryAfterMs = effectiveCooldownMs - (now - lastCreatedAt);
    if (retryAfterMs > 0) {
      throw new MessageCooldownError(retryAfterMs);
    }
  }

  private async findDuplicateRecentMessage(
    userId: string,
    chatId: string,
    now: number,
    payload: {
      text: string;
      replyToMessageId: string | null;
      attachmentIds: string[];
      gifUrl: string | null;
      pollQuestion: string | null;
      pollOptions: string[];
    }
  ): Promise<MessageRow | null> {
    const pool = getMysqlPool();
    const [rows] = await pool.query<MessageRow[]>(
      `
        SELECT
          m.id,
          m.chat_id,
          m.user_id,
          m.text,
          m.created_at,
          m.attachments_json,
          a.username,
          a.first_name,
          a.last_name,
          a.bio,
          a.email,
          a.global_role,
          a.accent_color,
          a.chat_background,
          a.avatar_updated_at
        FROM messages m
        JOIN auth_accounts a ON a.user_id = m.user_id
        WHERE m.chat_id = ?
          AND m.user_id = ?
          AND m.created_at >= ?
        ORDER BY m.created_at DESC
        LIMIT 6
      `,
      [chatId, userId, now - CHAT_LIMITS.duplicateMessageWindowMs]
    );

    for (const row of rows) {
      const meta = parseMessageMeta(row.attachments_json);
      const rowReplyToId = meta.replyTo?.id ?? null;
      const rowAttachmentIds = (meta.attachments ?? []).map((attachment) => attachment.id).sort();
      const rowGifUrl = meta.gif?.url ?? null;
      const rowPollQuestion = meta.poll?.question ?? null;
      const rowPollOptions = (meta.poll?.options ?? []).map((option) => option.text).sort();

      if (row.text !== payload.text) {
        continue;
      }
      if (rowReplyToId !== payload.replyToMessageId) {
        continue;
      }
      if (rowGifUrl !== payload.gifUrl) {
        continue;
      }
      if (rowPollQuestion !== payload.pollQuestion) {
        continue;
      }
      if (rowAttachmentIds.length !== payload.attachmentIds.length || rowAttachmentIds.some((value, index) => value !== payload.attachmentIds[index])) {
        continue;
      }
      if (rowPollOptions.length !== payload.pollOptions.length || rowPollOptions.some((value, index) => value !== payload.pollOptions[index])) {
        continue;
      }

      return row;
    }

    return null;
  }

  async setTyping(userId: string, chatId: string, isTyping: boolean): Promise<void> {
    const role = await this.getMembershipRole(userId, chatId);
    if (!role) {
      throw new Error('Chat not accessible.');
    }
    await this.assertGroupUserCanPost(chatId, userId);

    const now = Date.now();
    this.cleanupTyping(now);

    const map = this.typingByChat.get(chatId) ?? new Map<string, number>();
    if (isTyping) {
      map.set(userId, now + this.typingTtlMs);
      this.typingByChat.set(chatId, map);
      return;
    }

    map.delete(userId);
    if (map.size === 0) {
      this.typingByChat.delete(chatId);
    } else {
      this.typingByChat.set(chatId, map);
    }
  }

  async listTypingUsers(chatId: string, excludeUserId?: string): Promise<AppUserProfile[]> {
    await this.ensureReady();
    const now = Date.now();
    this.cleanupTyping(now);

    const map = this.typingByChat.get(chatId);
    if (!map || map.size === 0) {
      return [];
    }

    const userIds = [...map.keys()].filter((id) => id !== excludeUserId);
    if (userIds.length === 0) {
      return [];
    }

    const pool = getMysqlPool();
    const placeholders = userIds.map(() => '?').join(',');
    const [rows] = await pool.query<FriendProfileRow[]>(
      `
        SELECT
          a.user_id,
          a.username,
          a.first_name,
          a.last_name,
          a.bio,
          a.email,
          a.global_role,
          a.accent_color,
          a.chat_background,
          a.avatar_updated_at
        FROM auth_accounts a
        WHERE a.user_id IN (${placeholders})
      `,
      userIds
    );

    return rows.map((row) => mapProfile(row));
  }

  private mapChatSummary(row: ChatSummaryRow): AppChatSummary {
    const role = row.member_role ?? null;
    const canManageMembers = row.chat_type === 'group' && Boolean(
      role && hasGroupCapability({ memberRole: role, globalRole: null }, 'manage_members')
    );
    const inviteMode = row.chat_type === 'group' ? toGroupInviteMode(row.group_invite_mode) : null;
    const invitePolicy = row.chat_type === 'group' ? toGroupInvitePolicy(row.group_invite_policy) : null;
    const autoHideAfter24h = row.chat_type === 'group' ? asNumber(row.group_auto_hide_24h) === 1 : false;

    return {
      id: row.id,
      name: row.name,
      kind: row.chat_type,
      createdBy: row.created_by,
      createdAt: asNumber(row.created_at),
      updatedAt: asNumber(row.updated_at),
      membersCount: asNumber(row.members_count),
      memberRole: role,
      lastMessageAt: asNullableNumber(row.last_message_at),
      lastMessageText: row.last_message_text ?? null,
      unreadCount: asNumber(row.unread_count),
      mentionCount: asNumber(row.mention_count),
      canManageMembers,
      groupInviteMode: inviteMode,
      groupInvitePolicy: invitePolicy,
      groupAutoHideAfter24h: autoHideAfter24h
    };
  }

  private async listChats(userId: string): Promise<AppChatSummary[]> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const nowMinus24h = Date.now() - 24 * 60 * 60 * 1000;

    const [rows] = await pool.query<ChatSummaryRow[]>(
      `
        SELECT
          c.id,
          c.name,
          c.created_by,
          c.created_at,
          c.updated_at,
          c.chat_type,
          c.group_invite_mode,
          c.group_invite_policy,
          c.group_everyone_mention_policy,
          c.group_here_mention_policy,
          c.group_invite_code,
          c.group_auto_hide_24h,
          cm_user.member_role,
          COUNT(DISTINCT cm_all.user_id) AS members_count,
          MAX(m.created_at) AS last_message_at,
          (
            SELECT COUNT(*)
            FROM messages um
            WHERE um.chat_id = c.id
              AND (c.chat_type <> 'group' OR c.group_auto_hide_24h = 0 OR um.created_at >= ?)
              AND um.created_at > COALESCE(cr.last_read_at, 0)
          ) AS unread_count,
          (
            SELECT COUNT(*)
            FROM messages mm
            WHERE mm.chat_id = c.id
              AND (c.chat_type <> 'group' OR c.group_auto_hide_24h = 0 OR mm.created_at >= ?)
              AND mm.created_at > COALESCE(cr.last_read_at, 0)
              AND mm.user_id <> cm_user.user_id
              AND (
                mm.text LIKE CONCAT('%@', a_me.username, '%')
                OR (
                  JSON_VALID(mm.attachments_json)
                  AND JSON_CONTAINS(
                    COALESCE(JSON_EXTRACT(mm.attachments_json, '$.mentionUserIds'), JSON_ARRAY()),
                    JSON_QUOTE(cm_user.user_id)
                  )
                )
              )
          ) AS mention_count,
          SUBSTRING_INDEX(
            GROUP_CONCAT(m.text ORDER BY m.created_at DESC SEPARATOR '\n'),
            '\n',
            1
          ) AS last_message_text
        FROM chats c
        JOIN chat_memberships cm_user
          ON cm_user.chat_id = c.id
         AND cm_user.user_id = ?
         AND cm_user.left_at IS NULL
        JOIN auth_accounts a_me
          ON a_me.user_id = cm_user.user_id
        LEFT JOIN chat_memberships cm_all
          ON cm_all.chat_id = c.id
         AND cm_all.left_at IS NULL
        LEFT JOIN messages m
          ON m.chat_id = c.id
         AND (c.chat_type <> 'group' OR c.group_auto_hide_24h = 0 OR m.created_at >= ?)
        LEFT JOIN chat_reads cr
          ON cr.chat_id = c.id
         AND cr.user_id = cm_user.user_id
        WHERE c.deactivated_at IS NULL
        GROUP BY
          c.id,
          c.name,
          c.created_by,
          c.created_at,
          c.updated_at,
          c.chat_type,
          c.group_invite_mode,
          c.group_invite_policy,
          c.group_everyone_mention_policy,
          c.group_here_mention_policy,
          c.group_invite_code,
          c.group_auto_hide_24h,
          cm_user.user_id,
          cm_user.member_role,
          a_me.username
        ORDER BY
          c.chat_type = 'global' DESC,
          COALESCE(MAX(m.created_at), c.updated_at) DESC,
          c.name ASC
      `,
      [nowMinus24h, nowMinus24h, userId, nowMinus24h]
    );

    return rows.map((row) => this.mapChatSummary(row));
  }

  private async listFriends(userId: string): Promise<AppUserProfile[]> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<FriendProfileRow[]>(
      `
        SELECT
          a.user_id,
          a.username,
          a.first_name,
          a.last_name,
          a.bio,
          a.email,
          a.global_role,
          a.avatar_updated_at
        FROM friendships f
        JOIN auth_accounts a
          ON a.user_id = CASE WHEN f.user_low = ? THEN f.user_high ELSE f.user_low END
        WHERE f.user_low = ? OR f.user_high = ?
        ORDER BY a.username ASC
      `,
      [userId, userId, userId]
    );

    return rows.map((row) => mapProfile(row, { isFriend: true }));
  }

  private mapFriendRequest(row: FriendRequestRow, viewerId: string): FriendRequestItem {
    const sender = mapProfile(
      {
        user_id: row.sender_id,
        username: row.sender_username,
        first_name: row.sender_first_name,
        last_name: row.sender_last_name,
        bio: row.sender_bio,
        email: row.sender_email,
        global_role: row.sender_role,
        accent_color: '#38bdf8',
        chat_background: 'aurora',
        avatar_updated_at: row.sender_avatar_updated_at
      },
      { includeEmail: false }
    );

    const receiver = mapProfile(
      {
        user_id: row.receiver_id,
        username: row.receiver_username,
        first_name: row.receiver_first_name,
        last_name: row.receiver_last_name,
        bio: row.receiver_bio,
        email: row.receiver_email,
        global_role: row.receiver_role,
        accent_color: '#38bdf8',
        chat_background: 'aurora',
        avatar_updated_at: row.receiver_avatar_updated_at
      },
      { includeEmail: false }
    );

    return {
      id: row.id,
      sender,
      receiver,
      status: row.status,
      createdAt: asNumber(row.created_at),
      updatedAt: asNumber(row.updated_at),
      isIncoming: row.receiver_id === viewerId
    };
  }

  private async listFriendRequests(
    userId: string
  ): Promise<{ incoming: FriendRequestItem[]; outgoing: FriendRequestItem[] }> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<FriendRequestRow[]>(
      `
        SELECT
          fr.id,
          fr.sender_id,
          fr.receiver_id,
          fr.status,
          fr.created_at,
          fr.updated_at,
          sender.username AS sender_username,
          sender.first_name AS sender_first_name,
          sender.last_name AS sender_last_name,
          sender.bio AS sender_bio,
          sender.email AS sender_email,
          sender.global_role AS sender_role,
          sender.avatar_updated_at AS sender_avatar_updated_at,
          receiver.username AS receiver_username,
          receiver.first_name AS receiver_first_name,
          receiver.last_name AS receiver_last_name,
          receiver.bio AS receiver_bio,
          receiver.email AS receiver_email,
          receiver.global_role AS receiver_role,
          receiver.avatar_updated_at AS receiver_avatar_updated_at
        FROM friend_requests fr
        JOIN auth_accounts sender ON sender.user_id = fr.sender_id
        JOIN auth_accounts receiver ON receiver.user_id = fr.receiver_id
        WHERE fr.status = 'pending'
          AND (fr.sender_id = ? OR fr.receiver_id = ?)
        ORDER BY fr.created_at DESC
      `,
      [userId, userId]
    );

    const mapped = rows.map((row) => this.mapFriendRequest(row, userId));
    return {
      incoming: mapped.filter((item) => item.receiver.id === userId),
      outgoing: mapped.filter((item) => item.sender.id === userId)
    };
  }

  async registerAccount(input: {
    username: string;
    password: string;
    email?: string;
    firstName: string;
    lastName: string;
    ip: string;
    userAgent: string;
  }): Promise<{ userId: string; status: 'pending' }> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    const username = input.username.trim();
    const usernameNorm = normalizeUsername(username);
    const email = input.email?.trim() ? input.email.trim() : null;
    const emailNorm = email ? normalizeEmail(email) : null;
    const ipNorm = normalizeIp(input.ip);
    const displayName = `${input.firstName.trim()} ${input.lastName.trim()}`.trim() || username;
    const displayNameNorm = normalizeDisplayName(displayName);
    const fingerprint = simplifyNameFingerprint(displayName);

    await this.assertIpAllowed(ipNorm, 'register');
    await this.enforceIpRateLimit(ipNorm, 'register', APP_LIMITS.registerIpLimit, APP_LIMITS.registerIpWindowMs, 'register-rate');
    await this.enforceIpRateLimit(ipNorm, 'register-daily', APP_LIMITS.registerIpDailyLimit, 24 * 60 * 60 * 1000, 'register-daily');

    await this.assertAllowedIdentity({
      username,
      firstName: input.firstName,
      lastName: input.lastName,
      email
    });

    const [existingRows] = await pool.query<RowDataPacket[]>(
      'SELECT 1 FROM auth_accounts WHERE username_norm = ? OR (email_norm IS NOT NULL AND email_norm = ?) LIMIT 1',
      [usernameNorm, emailNorm]
    );
    if (existingRows.length > 0) {
      throw new Error('Username or email already exists.');
    }

    const [sameNameRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT 1
        FROM users
        WHERE LOWER(TRIM(name)) = ?
        LIMIT 1
      `,
      [displayNameNorm]
    );
    if (sameNameRows.length > 0) {
      await this.registerIpAbuse(ipNorm, 'duplicate-display-name');
      throw new Error('Dieser vollständige Name existiert bereits.');
    }

    const [ipRecentRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT a.username, a.first_name, a.last_name
        FROM users u
        JOIN auth_accounts a ON a.user_id = u.id
        WHERE LOWER(u.ip) = ?
          AND u.created_at >= ?
        ORDER BY u.created_at DESC
        LIMIT 100
      `,
      [ipNorm, now - 24 * 60 * 60 * 1000]
    );
    for (const row of ipRecentRows) {
      const existingFingerprint = simplifyNameFingerprint(
        `${String(row.first_name ?? '')} ${String(row.last_name ?? '')}`.trim() || String(row.username ?? '')
      );
      if (existingFingerprint && fingerprint && existingFingerprint === fingerprint) {
        await this.registerIpAbuse(ipNorm, 'name-variation-abuse', 3);
        throw new Error('Zu viele ähnliche Accounts von derselben IP-Adresse.');
      }
    }

    const [ipTotalRows] = await pool.query<CountRow[]>(
      `
        SELECT COUNT(*) AS total
        FROM users
        WHERE LOWER(ip) = ?
      `,
      [ipNorm]
    );
    const totalAccountsFromIp = asNumber(ipTotalRows[0]?.total, 0);
    if (totalAccountsFromIp >= APP_LIMITS.maxAccountsPerIp) {
      await this.registerIpAbuse(ipNorm, 'max-accounts-per-ip-reached', 3);
      throw new Error(`Diese IP-Adresse hat das Maximum von ${APP_LIMITS.maxAccountsPerIp} Accounts erreicht.`);
    }

    const [countRows] = await pool.query<CountRow[]>('SELECT COUNT(*) AS total FROM auth_accounts');
    const totalAccounts = asNumber(countRows[0]?.total, 0);
    const role: GlobalRole = totalAccounts === 0 ? 'superadmin' : 'user';

    const userId = randomUUID();
    const passwordHash = hashPassword(input.password);

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO users (id, name, status, created_at, updated_at, ip)
        VALUES (?, ?, 'pending', ?, ?, ?)
      `,
      [userId, displayName.slice(0, 64), now, now, ipNorm]
    );

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO auth_accounts (
          user_id,
          username,
          username_norm,
          email,
          email_norm,
          password_hash,
          first_name,
          last_name,
          bio,
          global_role,
          avatar_blob,
          avatar_mime,
          avatar_updated_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, NULL, NULL, NULL, ?, ?)
      `,
      [
        userId,
        username,
        usernameNorm,
        email,
        emailNorm,
        passwordHash,
        input.firstName.trim().slice(0, APP_LIMITS.profileFirstNameMax),
        input.lastName.trim().slice(0, APP_LIMITS.profileLastNameMax),
        role,
        now,
        now
      ]
    );
    return {
      userId,
      status: 'pending'
    };
  }

  async loginAccount(input: {
    identifier: string;
    password: string;
    userAgent: string;
    ip: string;
  }): Promise<{ token: string; session: UserSessionContext } | null> {
    const ipNorm = normalizeIp(input.ip);
    await this.assertIpAllowed(ipNorm, 'login');
    await this.enforceIpRateLimit(ipNorm, 'login', APP_LIMITS.loginIpLimit, APP_LIMITS.loginIpWindowMs, 'login-rate');
    await this.enforceIpRateLimit(ipNorm, 'login-burst', APP_LIMITS.loginIpBurstLimit, APP_LIMITS.loginIpBurstWindowMs, 'login-burst');

    const account = await this.getAccountByIdentifier(input.identifier);
    if (!account) {
      await this.registerIpAbuse(ipNorm, 'login-unknown-identifier');
      return null;
    }

    await this.assertAccountAllowed(account);

    if (account.user_status === 'pending') {
      throw new Error('Dein Account wartet noch auf Freigabe.');
    }

    if (account.user_status !== 'approved') {
      throw new Error('Dein Account ist derzeit nicht freigegeben.');
    }

    const isValid = verifyPassword(input.password, account.password_hash);
    if (!isValid) {
      await this.registerIpAbuse(ipNorm, 'login-bad-password');
      return null;
    }

    return this.createSession(account.user_id, input.userAgent);
  }

  async resolveSession(token: string): Promise<UserSessionContext | null> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    const tokenHash = hashToken(token);

    await this.cleanupExpiredSessions(now);

    const [rows] = await pool.query<SessionRow[]>(
      `
        SELECT id, user_id, expires_at, last_seen_at
        FROM auth_sessions
        WHERE token_hash = ?
        LIMIT 1
      `,
      [tokenHash]
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    if (asNumber(row.expires_at) <= now) {
      await pool.query<ResultSetHeader>('DELETE FROM auth_sessions WHERE id = ?', [row.id]);
      return null;
    }

    if (now - asNumber(row.last_seen_at) > 30_000) {
      await pool.query<ResultSetHeader>('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?', [now, row.id]);
    }

    return this.buildSession(row.user_id, row.id, asNumber(row.expires_at));
  }

  async logoutSession(token: string): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const tokenHash = hashToken(token);
    await pool.query<ResultSetHeader>('DELETE FROM auth_sessions WHERE token_hash = ?', [tokenHash]);
  }

  async requestPasswordReset(identifier: string, ip: string): Promise<string | null> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const ipNorm = normalizeIp(ip);
    await this.assertIpAllowed(ipNorm, 'reset');
    await this.enforceIpRateLimit(ipNorm, 'reset', APP_LIMITS.resetIpLimit, APP_LIMITS.resetIpWindowMs, 'reset-rate');
    const account = await this.getAccountByIdentifier(identifier);
    if (!account) {
      await this.registerIpAbuse(ipNorm, 'reset-unknown-identifier');
      return null;
    }

    await this.assertAccountAllowed(account);
    if (account.user_status !== 'approved') {
      return null;
    }

    const now = Date.now();
    const token = createSessionToken();
    const tokenHash = hashToken(token);
    const expiresAt = now + APP_LIMITS.passwordResetTtlMs;

    await this.cleanupExpiredResets(now);
    await pool.query<ResultSetHeader>(
      'UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL',
      [now, account.user_id]
    );

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at, used_at)
        VALUES (?, ?, ?, ?, ?, NULL)
      `,
      [randomUUID(), account.user_id, tokenHash, now, expiresAt]
    );

    return token;
  }

  async getUserStatus(userId: string): Promise<'pending' | 'approved' | 'rejected' | null> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<RowDataPacket[]>(
      `
        SELECT status
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [userId]
    );

    const status = String(rows[0]?.status ?? '').trim();
    if (status === 'pending' || status === 'approved' || status === 'rejected') {
      return status;
    }

    return null;
  }

  async resetPassword(token: string, newPassword: string, ip: string): Promise<boolean> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    const ipNorm = normalizeIp(ip);
    await this.assertIpAllowed(ipNorm, 'reset');
    await this.enforceIpRateLimit(ipNorm, 'reset-token', APP_LIMITS.resetIpLimit, APP_LIMITS.resetIpWindowMs, 'reset-token-rate');
    const tokenHash = hashToken(token);

    await this.cleanupExpiredResets(now);

    const [rows] = await pool.query<RowDataPacket[]>(
      `
        SELECT id, user_id
        FROM password_reset_tokens
        WHERE token_hash = ?
          AND used_at IS NULL
          AND expires_at > ?
        LIMIT 1
      `,
      [tokenHash, now]
    );

    const reset = rows[0];
    if (!reset?.user_id || !reset?.id) {
      await this.registerIpAbuse(ipNorm, 'reset-invalid-token');
      return false;
    }

    const account = await this.getAccountByUserId(String(reset.user_id));
    if (!account) {
      return false;
    }
    await this.assertAccountAllowed(account);

    await pool.query<ResultSetHeader>('UPDATE auth_accounts SET password_hash = ?, updated_at = ? WHERE user_id = ?', [
      hashPassword(newPassword),
      now,
      reset.user_id
    ]);

    await pool.query<ResultSetHeader>('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?', [now, reset.id]);
    await pool.query<ResultSetHeader>('DELETE FROM auth_sessions WHERE user_id = ?', [reset.user_id]);
    return true;
  }

  async getBootstrap(userId: string, requestedChatId?: string): Promise<AppBootstrap> {
    await this.ensureReady();
    await this.ensureGlobalMembership(userId);
    const meAccount = await this.getAccountByUserId(userId);
    if (!meAccount) {
      throw new Error('Account not found.');
    }

    const [chats, friends, requests, nicknameSlots] = await Promise.all([
      this.listChats(userId),
      this.listFriends(userId),
      this.listFriendRequests(userId),
      this.listNicknameSlots(userId)
    ]);
    const globalNickname = nicknameSlots.find((slot) => slot.scope === 'global')?.nickname ?? undefined;

    const activeChatId = chats.find((chat) => chat.id === requestedChatId)?.id ?? chats[0]?.id ?? null;

    return {
      me: mapProfile(meAccount, { includeEmail: true, displayName: globalNickname, nicknameSlots }),
      chats,
      activeChatId,
      friends,
      incomingRequests: requests.incoming,
      outgoingRequests: requests.outgoing
    };
  }

  async listDiscoverUsers(userId: string, search = ''): Promise<AppUserProfile[]> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const q = `%${search.trim().toLowerCase()}%`;

    const [rows] = await pool.query<ProfileWithFriendRow[]>(
      `
        SELECT
          a.user_id,
          a.username,
          a.first_name,
          a.last_name,
          a.bio,
          a.email,
          a.global_role,
          a.accent_color,
          a.chat_background,
          a.avatar_updated_at,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM friendships f
              WHERE
                (f.user_low = LEAST(?, a.user_id) AND f.user_high = GREATEST(?, a.user_id))
            ) THEN 1
            ELSE 0
          END AS is_friend
        FROM auth_accounts a
        JOIN users u ON u.id = a.user_id
        WHERE a.user_id <> ?
          AND u.status = 'approved'
          AND (
            ? = '%%'
            OR LOWER(a.username) LIKE ?
            OR LOWER(a.first_name) LIKE ?
            OR LOWER(a.last_name) LIKE ?
          )
        ORDER BY is_friend DESC, a.username ASC
        LIMIT ?
      `,
      [userId, userId, userId, q, q, q, q, APP_LIMITS.discoverPageSize]
    );

    return rows.map((row) => mapProfile(row, { isFriend: asNumber(row.is_friend) === 1 }));
  }

  async getProfile(viewerId: string, targetId: string): Promise<AppUserProfile | null> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<ProfileWithFriendRow[]>(
      `
        SELECT
          a.user_id,
          a.username,
          a.first_name,
          a.last_name,
          a.bio,
          a.email,
          a.global_role,
          a.accent_color,
          a.chat_background,
          a.avatar_updated_at,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM friendships f
              WHERE f.user_low = LEAST(?, a.user_id)
                AND f.user_high = GREATEST(?, a.user_id)
            ) THEN 1
            ELSE 0
          END AS is_friend
        FROM auth_accounts a
        JOIN users u ON u.id = a.user_id
        WHERE a.user_id = ?
          AND u.status = 'approved'
        LIMIT 1
      `,
      [viewerId, viewerId, targetId]
    );

    const row = rows[0];
    if (!row) {
      return null;
    }
    const nicknameSlots = viewerId === targetId ? await this.listNicknameSlots(targetId) : undefined;
    const globalNickname = nicknameSlots?.find((slot) => slot.scope === 'global')?.nickname ?? undefined;
    return mapProfile(row, {
      isFriend: asNumber(row.is_friend) === 1,
      includeEmail: viewerId === targetId,
      displayName: globalNickname,
      nicknameSlots
    });
  }

  async listNicknameSlots(userId: string): Promise<AppNicknameSlot[]> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const [rows] = await pool.query<NicknameSlotRow[]>(
      `
        SELECT
          s.id,
          s.user_id,
          s.nickname,
          s.nickname_norm,
          s.scope,
          s.chat_id,
          c.name AS chat_name,
          s.created_at,
          s.updated_at
        FROM user_nickname_slots s
        LEFT JOIN chats c ON c.id = s.chat_id
        WHERE s.user_id = ?
        ORDER BY s.updated_at DESC, s.created_at DESC
      `,
      [userId]
    );
    return rows.map(mapNicknameSlot);
  }

  private async loadResolvedNicknamesForChat(chatId: string, userIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const normalizedUserIds = normalizeIds(userIds);
    if (normalizedUserIds.length === 0) {
      return out;
    }
    const pool = getMysqlPool();
    const placeholders = normalizedUserIds.map(() => '?').join(',');
    const [rows] = await pool.query<NicknameSlotRow[]>(
      `
        SELECT
          s.id,
          s.user_id,
          s.nickname,
          s.nickname_norm,
          s.scope,
          s.chat_id,
          c.name AS chat_name,
          s.created_at,
          s.updated_at
        FROM user_nickname_slots s
        LEFT JOIN chats c ON c.id = s.chat_id
        WHERE s.user_id IN (${placeholders})
          AND (
            s.scope = 'global'
            OR (s.scope = 'chat' AND s.chat_id = ?)
          )
        ORDER BY
          s.scope = 'chat' DESC,
          s.updated_at DESC,
          s.created_at DESC
      `,
      [...normalizedUserIds, chatId]
    );
    for (const row of rows) {
      if (!out.has(row.user_id)) {
        out.set(row.user_id, row.nickname);
      }
    }
    return out;
  }

  async updateMyProfile(
    userId: string,
    input: {
      firstName: string;
      lastName: string;
      bio: string;
      email: string | null;
      accentColor: string;
      chatBackground: ChatBackgroundPreset;
      nicknameSlots: Array<{
        id?: string | null;
        nickname: string;
        scope: NicknameScope;
        chatId: string | null;
      }>;
    }
  ): Promise<AppUserProfile> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    const firstName = input.firstName.trim().slice(0, APP_LIMITS.profileFirstNameMax);
    const lastName = input.lastName.trim().slice(0, APP_LIMITS.profileLastNameMax);
    const bio = input.bio.trim().slice(0, APP_LIMITS.profileBioMax);
    const email = input.email?.trim() ? input.email.trim() : null;
    const emailNorm = email ? normalizeEmail(email) : null;
    const displayName = `${firstName} ${lastName}`.trim();
    const accentColor = input.accentColor.trim().slice(0, 7) || '#38bdf8';
    const chatBackground = toChatBackgroundPreset(input.chatBackground);
    const nicknameSlots = input.nicknameSlots.slice(0, APP_LIMITS.profileNicknameSlotsMax);

    await this.assertAllowedIdentity({
      firstName,
      lastName,
      email
    });

    for (const slot of nicknameSlots) {
      await this.assertAllowedIdentity({
        firstName: slot.nickname
      });
    }

    if (emailNorm) {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT 1 FROM auth_accounts WHERE email_norm = ? AND user_id <> ? LIMIT 1',
        [emailNorm, userId]
      );
      if (rows.length > 0) {
        throw new Error('Email already in use.');
      }
    }

    await pool.query<ResultSetHeader>(
      `
        UPDATE auth_accounts
        SET first_name = ?, last_name = ?, bio = ?, email = ?, email_norm = ?, accent_color = ?, chat_background = ?, updated_at = ?
        WHERE user_id = ?
      `,
      [firstName, lastName, bio, email, emailNorm, accentColor, chatBackground, now, userId]
    );

    await pool.query<ResultSetHeader>('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [
      displayName.slice(0, 64),
      now,
      userId
    ]);

    const existingSlots = await this.listNicknameSlots(userId);
    const existingIds = new Set(existingSlots.map((slot) => slot.id));
    const seenSlotKeys = new Set<string>();

    for (const slot of nicknameSlots) {
      const slotId = slot.id?.trim() && existingIds.has(slot.id.trim()) ? slot.id.trim() : randomUUID();
      const scope = slot.scope === 'chat' ? 'chat' : 'global';
      const chatId = scope === 'chat' ? slot.chatId?.trim() || null : null;
      const nickname = slot.nickname.trim().slice(0, APP_LIMITS.profileNicknameMax);
      const nicknameNorm = normalizeName(nickname).toLowerCase();
      const dedupeKey = `${scope}:${chatId ?? 'global'}`;
      if (seenSlotKeys.has(dedupeKey)) {
        throw new Error('Only one nickname per scope/chat is allowed.');
      }
      seenSlotKeys.add(dedupeKey);
      if (scope === 'chat' && !chatId) {
        throw new Error('Chat nickname requires a chatId.');
      }
      if (scope === 'chat') {
        const role = await this.getMembershipRole(userId, chatId!);
        if (!role) {
          throw new Error('Chat-specific nickname requires membership in that chat.');
        }
      }

      await pool.query<ResultSetHeader>(
        `
          INSERT INTO user_nickname_slots (id, user_id, nickname, nickname_norm, scope, chat_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            nickname = VALUES(nickname),
            nickname_norm = VALUES(nickname_norm),
            scope = VALUES(scope),
            chat_id = VALUES(chat_id),
            updated_at = VALUES(updated_at)
        `,
        [slotId, userId, nickname, nicknameNorm, scope, chatId, now, now]
      );
      existingIds.delete(slotId);
    }

    for (const staleId of existingIds) {
      await pool.query<ResultSetHeader>('DELETE FROM user_nickname_slots WHERE id = ? AND user_id = ?', [staleId, userId]);
    }

    const account = await this.getAccountByUserId(userId);
    if (!account) {
      throw new Error('Profile not found.');
    }
    const nextNicknameSlots = await this.listNicknameSlots(userId);
    const globalNickname = nextNicknameSlots.find((slot) => slot.scope === 'global')?.nickname ?? undefined;
    return mapProfile(account, { includeEmail: true, displayName: globalNickname, nicknameSlots: nextNicknameSlots });
  }

  async setAvatar(userId: string, mimeType: string, buffer: Buffer): Promise<number> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();

    await pool.query<ResultSetHeader>(
      'UPDATE auth_accounts SET avatar_blob = ?, avatar_mime = ?, avatar_updated_at = ?, updated_at = ? WHERE user_id = ?',
      [buffer, mimeType, now, now, userId]
    );

    return now;
  }

  async getAvatar(userId: string): Promise<{ mimeType: string; buffer: Buffer; updatedAt: number } | null> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<RowDataPacket[]>(
      `
        SELECT avatar_blob, avatar_mime, avatar_updated_at
        FROM auth_accounts
        WHERE user_id = ?
        LIMIT 1
      `,
      [userId]
    );

    const row = rows[0];
    if (!row?.avatar_blob || !row?.avatar_mime || !row?.avatar_updated_at) {
      return null;
    }

    const bufferValue = row.avatar_blob;
    const buffer = Buffer.isBuffer(bufferValue) ? bufferValue : Buffer.from(bufferValue as Uint8Array);
    return {
      mimeType: String(row.avatar_mime),
      buffer,
      updatedAt: asNumber(row.avatar_updated_at)
    };
  }

  async sendFriendRequest(senderId: string, targetId: string): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();

    if (senderId === targetId) {
      throw new Error('You cannot add yourself.');
    }

    const [targetRows] = await pool.query<RowDataPacket[]>(
      'SELECT 1 FROM auth_accounts WHERE user_id = ? LIMIT 1',
      [targetId]
    );
    if (targetRows.length === 0) {
      throw new Error('Target user not found.');
    }

    const pair = sortFriendPair(senderId, targetId);
    const [friendRows] = await pool.query<RowDataPacket[]>(
      'SELECT 1 FROM friendships WHERE user_low = ? AND user_high = ? LIMIT 1',
      [pair.low, pair.high]
    );
    if (friendRows.length > 0) {
      throw new Error('Already friends.');
    }

    const [incomingRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT id
        FROM friend_requests
        WHERE sender_id = ?
          AND receiver_id = ?
          AND status = 'pending'
        LIMIT 1
      `,
      [targetId, senderId]
    );

    const incoming = incomingRows[0];
    if (incoming?.id) {
      await this.respondToFriendRequest(senderId, String(incoming.id), 'accept');
      return;
    }

    const [outgoingRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT 1
        FROM friend_requests
        WHERE sender_id = ?
          AND receiver_id = ?
          AND status = 'pending'
        LIMIT 1
      `,
      [senderId, targetId]
    );
    if (outgoingRows.length > 0) {
      throw new Error('Request already pending.');
    }

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO friend_requests (id, sender_id, receiver_id, status, created_at, updated_at)
        VALUES (?, ?, ?, 'pending', ?, ?)
      `,
      [randomUUID(), senderId, targetId, now, now]
    );
  }

  async respondToFriendRequest(userId: string, requestId: string, action: 'accept' | 'decline'): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();

    const [rows] = await pool.query<RowDataPacket[]>(
      `
        SELECT id, sender_id, receiver_id
        FROM friend_requests
        WHERE id = ?
          AND receiver_id = ?
          AND status = 'pending'
        LIMIT 1
      `,
      [requestId, userId]
    );

    const requestRow = rows[0];
    if (!requestRow?.id || !requestRow?.sender_id || !requestRow?.receiver_id) {
      throw new Error('Friend request not found.');
    }

    const nextStatus = action === 'accept' ? 'accepted' : 'declined';
    await pool.query<ResultSetHeader>('UPDATE friend_requests SET status = ?, updated_at = ? WHERE id = ?', [
      nextStatus,
      now,
      requestId
    ]);

    if (action === 'accept') {
      const pair = sortFriendPair(String(requestRow.sender_id), String(requestRow.receiver_id));
      await pool.query<ResultSetHeader>(
        'INSERT IGNORE INTO friendships (user_low, user_high, created_at) VALUES (?, ?, ?)',
        [pair.low, pair.high, now]
      );
    }
  }

  async removeFriend(userId: string, targetId: string): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const pair = sortFriendPair(userId, targetId);
    const now = Date.now();

    await pool.query<ResultSetHeader>('DELETE FROM friendships WHERE user_low = ? AND user_high = ?', [pair.low, pair.high]);
    await pool.query<ResultSetHeader>(
      `
        UPDATE friend_requests
        SET status = 'cancelled', updated_at = ?
        WHERE status = 'pending'
          AND (
            (sender_id = ? AND receiver_id = ?)
            OR (sender_id = ? AND receiver_id = ?)
          )
      `,
      [now, userId, targetId, targetId, userId]
    );
  }

  private async getMembershipRole(userId: string, chatId: string): Promise<GroupMemberRole | null> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<RowDataPacket[]>(
      `
        SELECT member_role
        FROM chat_memberships
        WHERE chat_id = ?
          AND user_id = ?
          AND left_at IS NULL
        LIMIT 1
      `,
      [chatId, userId]
    );

    return isGroupMemberRole(rows[0]?.member_role) ? rows[0].member_role : null;
  }

  private async getGroupChatControl(chatId: string): Promise<GroupChatControlRow | null> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<GroupChatControlRow[]>(
      `
        SELECT
          id,
          chat_type,
          created_by,
          deactivated_at,
          group_invite_mode,
          group_invite_policy,
          group_everyone_mention_policy,
          group_here_mention_policy,
          group_invite_code,
          group_auto_hide_24h,
          group_message_cooldown_ms
        FROM chats
        WHERE id = ?
        LIMIT 1
      `,
      [chatId]
    );

    return rows[0] ?? null;
  }

  private async getGroupPermissionState(userId: string, chatId: string): Promise<GroupPermissionState | null> {
    const [chat, account, memberRole] = await Promise.all([
      this.getGroupChatControl(chatId),
      this.getAccountByUserId(userId),
      this.getMembershipRole(userId, chatId)
    ]);
    if (!chat) {
      return null;
    }

    return {
      chat,
      context: {
        memberRole,
        globalRole: account?.global_role ?? null,
        invitePolicy: toGroupInvitePolicy(chat.group_invite_policy),
        everyoneMentionPolicy: toGroupMentionPolicy(chat.group_everyone_mention_policy),
        hereMentionPolicy: toGroupMentionPolicy(chat.group_here_mention_policy)
      }
    };
  }

  private async getGroupMemberRestriction(chatId: string, userId: string): Promise<GroupMemberRestrictionRow | null> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const [rows] = await pool.query<GroupMemberRestrictionRow[]>(
      `
        SELECT
          chat_id,
          user_id,
          muted_until,
          mute_reason,
          banned_at,
          banned_by_user_id,
          ban_reason,
          created_at,
          updated_at
        FROM group_member_restrictions
        WHERE chat_id = ?
          AND user_id = ?
        LIMIT 1
      `,
      [chatId, userId]
    );
    return rows[0] ?? null;
  }

  private async assertGroupUserNotBanned(chatId: string, userId: string): Promise<void> {
    const restriction = await this.getGroupMemberRestriction(chatId, userId);
    if (restriction && asNullableNumber(restriction.banned_at)) {
      throw new PermissionDeniedError('Dieser Nutzer ist für diese Gruppe gesperrt.');
    }
  }

  private async assertGroupUserCanPost(chatId: string, userId: string): Promise<void> {
    const restriction = await this.getGroupMemberRestriction(chatId, userId);
    const now = Date.now();
    const mutedUntil = restriction ? asNullableNumber(restriction.muted_until) : null;
    if (mutedUntil && mutedUntil > now) {
      throw new GroupMutedError(mutedUntil - now);
    }
  }

  private async assertGroupCapability(userId: string, chatId: string, capability: GroupCapability, message: string): Promise<GroupPermissionState> {
    const state = await this.getGroupPermissionState(userId, chatId);
    if (!state) {
      throw new Error('Chat not found.');
    }
    assertGroupCapability(state.context, capability, message);
    return state;
  }

  private buildGroupSettings(chat: GroupChatControlRow, role: GroupMemberRole): AppGroupSettings {
    const inviteMode = toGroupInviteMode(chat.group_invite_mode);
    const invitePolicy = toGroupInvitePolicy(chat.group_invite_policy);
    const everyoneMentionPolicy = toGroupMentionPolicy(chat.group_everyone_mention_policy);
    const hereMentionPolicy = toGroupMentionPolicy(chat.group_here_mention_policy);
    const context: GroupPermissionContext = {
      memberRole: role,
      globalRole: null,
      invitePolicy,
      everyoneMentionPolicy,
      hereMentionPolicy
    };
    const canManageUsers = hasGroupCapability(context, 'manage_members');
    const canManageSettings = hasGroupCapability(context, 'manage_settings');

    return {
      inviteMode,
      invitePolicy,
      inviteCode: canManageSettings ? (chat.group_invite_code?.trim() || null) : null,
      inviteLink: canManageSettings && chat.group_invite_code
        ? `/chat?inviteCode=${encodeURIComponent(chat.group_invite_code)}`
        : null,
      autoHideAfter24h: asNumber(chat.group_auto_hide_24h) === 1,
      messageCooldownMs: normalizeGroupMessageCooldownMs(asNumber(chat.group_message_cooldown_ms, CHAT_LIMITS.defaultGroupMessageCooldownMs)),
      canInviteDirectly: inviteMode === 'direct' && hasGroupCapability(context, 'invite_members'),
      canManageUsers,
      canManageSettings,
      canModerateMessages: hasGroupCapability(context, 'moderate_messages'),
      canViewModerationLogs: hasGroupCapability(context, 'view_moderation_logs'),
      canTransferOwnership: hasGroupCapability(context, 'transfer_ownership'),
      canCloseGroup: hasGroupCapability(context, 'close_group'),
      everyoneMentionPolicy,
      hereMentionPolicy,
      canUseEveryoneMention: hasGroupCapability(context, 'use_everyone_mention'),
      canUseHereMention: hasGroupCapability(context, 'use_here_mention')
    };
  }

  private async getChatMessageVisibleAfter(chatId: string): Promise<number> {
    await this.ensureReady();
    const chat = await this.getGroupChatControl(chatId);
    if (!chat) {
      return Number.MAX_SAFE_INTEGER;
    }
    if (chat.chat_type !== 'group') {
      return 0;
    }
    if (asNumber(chat.group_auto_hide_24h) !== 1) {
      return 0;
    }
    return Date.now() - 24 * 60 * 60 * 1000;
  }

  async createOrGetDirectChat(userId: string, targetUserId: string): Promise<AppChatSummary> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();

    if (userId === targetUserId) {
      throw new Error('Cannot create direct chat with yourself.');
    }

    const [targetRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT 1
        FROM auth_accounts a
        JOIN users u ON u.id = a.user_id
        WHERE a.user_id = ?
          AND u.status = 'approved'
        LIMIT 1
      `,
      [targetUserId]
    );
    if (targetRows.length === 0) {
      throw new Error('Target user not found.');
    }

    const dmKey = [userId, targetUserId].sort().join(':');
    const [existingRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT id
        FROM chats
        WHERE dm_key = ?
        LIMIT 1
      `,
      [dmKey]
    );

    let chatId = String(existingRows[0]?.id ?? '');

    if (!chatId) {
      chatId = randomUUID();
      const [names] = await pool.query<RowDataPacket[]>(
        `
          SELECT
            MAX(CASE WHEN user_id = ? THEN username END) AS a_name,
            MAX(CASE WHEN user_id = ? THEN username END) AS b_name
          FROM auth_accounts
          WHERE user_id IN (?, ?)
        `,
        [userId, targetUserId, userId, targetUserId]
      );
      const first = String(names[0]?.a_name ?? 'user');
      const second = String(names[0]?.b_name ?? 'user');
      const title = `DM: ${first} & ${second}`.slice(0, 80);

      await pool.query<ResultSetHeader>(
        `
          INSERT INTO chats (
            id,
            name,
            created_by,
            created_at,
            updated_at,
            is_global,
            chat_type,
            dm_key,
            deactivated_at,
            deactivated_by
          )
          VALUES (?, ?, ?, ?, ?, 0, 'direct', ?, NULL, NULL)
        `,
        [chatId, title, userId, now, now, dmKey]
      );
    } else {
      await pool.query<ResultSetHeader>(
        'UPDATE chats SET deactivated_at = NULL, deactivated_by = NULL, updated_at = ? WHERE id = ?',
        [now, chatId]
      );
    }

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO chat_memberships (chat_id, user_id, joined_at, member_role, left_at)
        VALUES (?, ?, ?, 'member', NULL)
        ON DUPLICATE KEY UPDATE left_at = NULL
      `,
      [chatId, userId, now]
    );
    await pool.query<ResultSetHeader>(
      `
        INSERT INTO chat_memberships (chat_id, user_id, joined_at, member_role, left_at)
        VALUES (?, ?, ?, 'member', NULL)
        ON DUPLICATE KEY UPDATE left_at = NULL
      `,
      [chatId, targetUserId, now]
    );

    const chats = await this.listChats(userId);
    const chat = chats.find((item) => item.id === chatId);
    if (!chat) {
      throw new Error('Direct chat could not be loaded.');
    }
    return chat;
  }

  async createGroupChat(userId: string, name: string, memberIds: string[]): Promise<AppChatSummary> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    const chatId = randomUUID();
    const normalizedName = name.trim().slice(0, 80);
    const uniqueMembers = normalizeIds(memberIds).filter((id) => id !== userId);

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO chats (
          id,
          name,
          created_by,
          created_at,
          updated_at,
          is_global,
          chat_type,
          group_invite_mode,
          group_invite_policy,
          group_invite_code,
          group_auto_hide_24h,
          dm_key,
          deactivated_at,
          deactivated_by
        )
        VALUES (?, ?, ?, ?, ?, 0, 'group', 'direct', 'admins', NULL, 0, NULL, NULL, NULL)
      `,
      [chatId, normalizedName, userId, now, now]
    );

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO chat_memberships (chat_id, user_id, joined_at, member_role, left_at)
        VALUES (?, ?, ?, 'owner', NULL)
      `,
      [chatId, userId, now]
    );

    if (uniqueMembers.length > 0) {
      const placeholders = uniqueMembers.map(() => '?').join(',');
      const [eligibleRows] = await pool.query<RowDataPacket[]>(
        `
          SELECT a.user_id
          FROM auth_accounts a
          JOIN users u ON u.id = a.user_id
          WHERE a.user_id IN (${placeholders})
            AND u.status = 'approved'
        `,
        uniqueMembers
      );

      for (const row of eligibleRows) {
        if (!row.user_id) {
          continue;
        }
        await pool.query<ResultSetHeader>(
          `
            INSERT INTO chat_memberships (chat_id, user_id, joined_at, member_role, left_at)
            VALUES (?, ?, ?, 'member', NULL)
            ON DUPLICATE KEY UPDATE left_at = NULL
          `,
          [chatId, String(row.user_id), now]
        );
      }
    }

    const chats = await this.listChats(userId);
    const chat = chats.find((item) => item.id === chatId);
    if (!chat) {
      throw new Error('Group chat could not be loaded.');
    }
    return chat;
  }

  async manageGroupMember(
    userId: string,
    chatId: string,
    targetUserId: string,
    action: 'invite' | 'promote' | 'demote' | 'kick' | 'transfer_ownership' | 'set_role' | 'mute_1h' | 'mute_24h' | 'unmute' | 'ban' | 'unban',
    nextRole?: GroupMemberRole | null,
    moderationReason?: string | null
  ): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();

    const permissionState = await this.getGroupPermissionState(userId, chatId);
    const chat = permissionState?.chat ?? null;
    const actorContext = permissionState?.context ?? null;
    if (!chat?.id || !actorContext || chat.chat_type !== 'group' || asNullableNumber(chat.deactivated_at)) {
      throw new Error('Only group chats can be managed.');
    }
    const actorRole = actorContext.memberRole;

    if (action === 'invite') {
      const inviteMode = toGroupInviteMode(chat.group_invite_mode);
      if (inviteMode === 'invite_link') {
        throw new Error('Direktes Hinzufuegen ist deaktiviert. Nutze den Invite-Link.');
      }
      assertGroupCapability(actorContext, 'invite_members', 'Insufficient group permissions.');

      const [targetRows] = await pool.query<RowDataPacket[]>(
        `
          SELECT 1
          FROM auth_accounts a
          JOIN users u ON u.id = a.user_id
          WHERE a.user_id = ?
            AND u.status = 'approved'
          LIMIT 1
        `,
        [targetUserId]
      );
      if (targetRows.length === 0) {
        throw new Error('Target user not found.');
      }
      await this.assertGroupUserNotBanned(chatId, targetUserId);

      await pool.query<ResultSetHeader>(
        `
          INSERT INTO chat_memberships (chat_id, user_id, joined_at, member_role, left_at)
          VALUES (?, ?, ?, 'member', NULL)
          ON DUPLICATE KEY UPDATE left_at = NULL
        `,
        [chatId, targetUserId, now]
      );
      await pool.query<ResultSetHeader>('UPDATE chats SET updated_at = ? WHERE id = ?', [now, chatId]);
      await this.appendGroupModerationLog(chatId, 'member_invited', userId, {
        targetUserId,
        details: { mode: 'direct' }
      });
      return;
    }

    const targetRole = await this.getMembershipRole(targetUserId, chatId);
    if (!targetRole && action !== 'unban') {
      throw new Error('Target user is not part of this group.');
    }
    if (action === 'unban') {
      const targetAccount = await this.getAccountByUserId(targetUserId);
      if (!targetAccount) {
        throw new Error('Target user not found.');
      }
    }

    if (action === 'transfer_ownership') {
      assertGroupCapability(actorContext, 'transfer_ownership', 'Only group owner can transfer ownership.');
    } else if (action === 'mute_1h' || action === 'mute_24h' || action === 'unmute' || action === 'ban' || action === 'unban') {
      assertGroupCapability(actorContext, 'moderate_messages', 'Insufficient group permissions.');
    } else {
      assertGroupCapability(actorContext, 'manage_members', 'Insufficient group permissions.');
    }

    if (targetUserId === userId && action !== 'transfer_ownership') {
      throw new Error('You cannot perform this action on yourself.');
    }

    if (targetRole === 'owner' && action !== 'transfer_ownership') {
      throw new Error('Group owner cannot be modified.');
    }

    const actorComparableRole = actorRole ?? (actorContext.globalRole === 'superadmin' ? 'owner' : null);
    const normalizedModerationReason = moderationReason?.trim().slice(0, 255) || null;
    if (!actorComparableRole) {
      throw new PermissionDeniedError('Insufficient group permissions.');
    }
    if (action !== 'transfer_ownership' && targetRole && !canManageRole(actorComparableRole, targetRole)) {
      throw new PermissionDeniedError('You cannot manage a member with the same or higher role.');
    }

    if (action === 'promote') {
      if (actorComparableRole !== 'owner') {
        throw new Error('Only owner can promote.');
      }
      if (targetRole !== 'member') {
        throw new Error('Only members can be promoted.');
      }
      await pool.query<ResultSetHeader>(
        'UPDATE chat_memberships SET member_role = ? WHERE chat_id = ? AND user_id = ? AND left_at IS NULL',
        ['admin', chatId, targetUserId]
      );
      await pool.query<ResultSetHeader>('UPDATE chats SET updated_at = ? WHERE id = ?', [now, chatId]);
      await this.appendGroupModerationLog(chatId, 'member_promoted', userId, {
        targetUserId
      });
      return;
    }

    if (action === 'demote') {
      if (actorComparableRole !== 'owner') {
        throw new Error('Only owner can demote.');
      }
      if (targetRole !== 'admin') {
        throw new Error('Only admins can be demoted.');
      }
      await pool.query<ResultSetHeader>(
        'UPDATE chat_memberships SET member_role = ? WHERE chat_id = ? AND user_id = ? AND left_at IS NULL',
        ['member', chatId, targetUserId]
      );
      await pool.query<ResultSetHeader>('UPDATE chats SET updated_at = ? WHERE id = ?', [now, chatId]);
      await this.appendGroupModerationLog(chatId, 'member_demoted', userId, {
        targetUserId
      });
      return;
    }

    if (action === 'set_role') {
      if (!nextRole) {
        throw new Error('A target role is required.');
      }
      if (!isGroupMemberRole(nextRole)) {
        throw new Error('Invalid target role.');
      }
      if (nextRole === 'owner') {
        throw new Error('Use ownership transfer to assign owner.');
      }
      if (targetRole === nextRole) {
        return;
      }
      if (actorComparableRole !== 'owner' && nextRole === 'admin') {
        throw new Error('Only owner can assign admin.');
      }
      if (actorComparableRole !== 'owner' && targetRole === 'admin') {
        throw new Error('Only owner can change admin roles.');
      }
      if (!canManageRole(actorComparableRole, nextRole)) {
        throw new PermissionDeniedError('You cannot assign a role equal to or higher than your own.');
      }

      await pool.query<ResultSetHeader>(
        'UPDATE chat_memberships SET member_role = ? WHERE chat_id = ? AND user_id = ? AND left_at IS NULL',
        [nextRole, chatId, targetUserId]
      );
      await pool.query<ResultSetHeader>('UPDATE chats SET updated_at = ? WHERE id = ?', [now, chatId]);
      await this.appendGroupModerationLog(chatId, 'member_role_changed', userId, {
        targetUserId,
        details: {
          fromRole: targetRole,
          toRole: nextRole
        }
      });
      return;
    }

    if (action === 'kick') {
      await pool.query<ResultSetHeader>(
        'UPDATE chat_memberships SET left_at = ? WHERE chat_id = ? AND user_id = ? AND left_at IS NULL',
        [now, chatId, targetUserId]
      );
      await pool.query<ResultSetHeader>('UPDATE chats SET updated_at = ? WHERE id = ?', [now, chatId]);
      await this.appendGroupModerationLog(chatId, 'member_kicked', userId, {
        targetUserId
      });
      return;
    }

    if (action === 'mute_1h' || action === 'mute_24h') {
      const durationMs = action === 'mute_1h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      const mutedUntil = now + durationMs;
      await pool.query<ResultSetHeader>(
        `
          INSERT INTO group_member_restrictions (
            chat_id,
            user_id,
            muted_until,
            mute_reason,
            banned_at,
            banned_by_user_id,
            ban_reason,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
          ON DUPLICATE KEY UPDATE
            muted_until = VALUES(muted_until),
            mute_reason = VALUES(mute_reason),
            updated_at = VALUES(updated_at)
        `,
        [chatId, targetUserId, mutedUntil, normalizedModerationReason ?? (action === 'mute_1h' ? 'temporary_1h' : 'temporary_24h'), now, now]
      );
      await pool.query<ResultSetHeader>('UPDATE chats SET updated_at = ? WHERE id = ?', [now, chatId]);
      await this.appendGroupModerationLog(chatId, 'member_muted', userId, {
        targetUserId,
        details: {
          mutedUntil,
          durationMs,
          reason: normalizedModerationReason
        }
      });
      return;
    }

    if (action === 'unmute') {
      await pool.query<ResultSetHeader>(
        `
          INSERT INTO group_member_restrictions (
            chat_id,
            user_id,
            muted_until,
            mute_reason,
            banned_at,
            banned_by_user_id,
            ban_reason,
            created_at,
            updated_at
          )
          VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
          ON DUPLICATE KEY UPDATE
            muted_until = NULL,
            mute_reason = NULL,
            updated_at = VALUES(updated_at)
        `,
        [chatId, targetUserId, now, now]
      );
      await this.appendGroupModerationLog(chatId, 'member_unmuted', userId, {
        targetUserId
      });
      return;
    }

    if (action === 'ban') {
      await pool.query<ResultSetHeader>(
        `
          INSERT INTO group_member_restrictions (
            chat_id,
            user_id,
            muted_until,
            mute_reason,
            banned_at,
            banned_by_user_id,
            ban_reason,
            created_at,
            updated_at
          )
          VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            banned_at = VALUES(banned_at),
            banned_by_user_id = VALUES(banned_by_user_id),
            ban_reason = VALUES(ban_reason),
            updated_at = VALUES(updated_at)
        `,
        [chatId, targetUserId, now, userId, normalizedModerationReason ?? 'group_ban', now, now]
      );
      await pool.query<ResultSetHeader>(
        'UPDATE chat_memberships SET left_at = ? WHERE chat_id = ? AND user_id = ? AND left_at IS NULL',
        [now, chatId, targetUserId]
      );
      await pool.query<ResultSetHeader>('UPDATE chats SET updated_at = ? WHERE id = ?', [now, chatId]);
      await this.appendGroupModerationLog(chatId, 'member_banned', userId, {
        targetUserId,
        details: {
          reason: normalizedModerationReason
        }
      });
      return;
    }

    if (action === 'unban') {
      await pool.query<ResultSetHeader>(
        `
          INSERT INTO group_member_restrictions (
            chat_id,
            user_id,
            muted_until,
            mute_reason,
            banned_at,
            banned_by_user_id,
            ban_reason,
            created_at,
            updated_at
          )
          VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)
          ON DUPLICATE KEY UPDATE
            banned_at = NULL,
            banned_by_user_id = NULL,
            ban_reason = NULL,
            updated_at = VALUES(updated_at)
        `,
        [chatId, targetUserId, now, now]
      );
      await this.appendGroupModerationLog(chatId, 'member_unbanned', userId, {
        targetUserId
      });
      return;
    }

    if (action === 'transfer_ownership') {
      if (targetUserId === userId) {
        throw new Error('Select another member for ownership transfer.');
      }
      if (targetRole === 'owner') {
        throw new Error('Target user is already the owner.');
      }

      await pool.query<ResultSetHeader>(
        'UPDATE chat_memberships SET member_role = ? WHERE chat_id = ? AND user_id = ? AND left_at IS NULL',
        ['member', chatId, userId]
      );
      await pool.query<ResultSetHeader>(
        'UPDATE chat_memberships SET member_role = ? WHERE chat_id = ? AND user_id = ? AND left_at IS NULL',
        ['owner', chatId, targetUserId]
      );
      await pool.query<ResultSetHeader>(
        'UPDATE chats SET created_by = ?, updated_at = ? WHERE id = ?',
        [targetUserId, now, chatId]
      );
      await this.appendGroupModerationLog(chatId, 'ownership_transferred', userId, {
        targetUserId
      });
      return;
    }

    throw new Error('Unsupported action.');
  }

  async updateGroupSettings(
    userId: string,
    chatId: string,
    input: {
      inviteMode: GroupInviteMode;
      invitePolicy: GroupInvitePolicy;
      everyoneMentionPolicy: GroupMentionPolicy;
      hereMentionPolicy: GroupMentionPolicy;
      autoHideAfter24h: boolean;
      messageCooldownMs: number;
    }
  ): Promise<AppGroupSettings> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    const state = await this.assertGroupCapability(userId, chatId, 'manage_settings', 'Only group owner can change settings.');
    const chat = state.chat;
    if (!chat?.id || chat.chat_type !== 'group' || asNullableNumber(chat.deactivated_at)) {
      throw new Error('Only active group chats can be configured.');
    }
    const role = state.context.memberRole ?? 'owner';

    const inviteMode = toGroupInviteMode(input.inviteMode);
    const invitePolicy = toGroupInvitePolicy(input.invitePolicy);
    const everyoneMentionPolicy = toGroupMentionPolicy(input.everyoneMentionPolicy);
    const hereMentionPolicy = toGroupMentionPolicy(input.hereMentionPolicy);
    const messageCooldownMs = normalizeGroupMessageCooldownMs(input.messageCooldownMs);
    let inviteCode = chat.group_invite_code?.trim() || null;
    if (inviteMode === 'invite_link' && !inviteCode) {
      inviteCode = createGroupInviteCode();
    }

    await pool.query<ResultSetHeader>(
      `
        UPDATE chats
        SET
          group_invite_mode = ?,
          group_invite_policy = ?,
          group_everyone_mention_policy = ?,
          group_here_mention_policy = ?,
          group_auto_hide_24h = ?,
          group_message_cooldown_ms = ?,
          group_invite_code = ?,
          group_invite_code_updated_at = CASE
            WHEN ? IS NULL THEN group_invite_code_updated_at
            ELSE ?
          END,
          updated_at = ?
        WHERE id = ?
      `,
      [
        inviteMode,
        invitePolicy,
        everyoneMentionPolicy,
        hereMentionPolicy,
        input.autoHideAfter24h ? 1 : 0,
        messageCooldownMs,
        inviteCode,
        inviteCode,
        now,
        now,
        chatId
      ]
    );
    await this.appendGroupModerationLog(chatId, 'settings_updated', userId, {
      details: {
        inviteMode,
        invitePolicy,
        everyoneMentionPolicy,
        hereMentionPolicy,
        autoHideAfter24h: input.autoHideAfter24h,
        messageCooldownMs
      }
    });

    const updated = await this.getGroupChatControl(chatId);
    if (!updated) {
      throw new Error('Group settings could not be loaded.');
    }
    return this.buildGroupSettings(updated, role);
  }

  async regenerateGroupInviteCode(userId: string, chatId: string): Promise<AppGroupSettings> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    const state = await this.assertGroupCapability(userId, chatId, 'manage_settings', 'Only group owner can regenerate invite links.');
    const chat = state.chat;
    if (!chat?.id || chat.chat_type !== 'group' || asNullableNumber(chat.deactivated_at)) {
      throw new Error('Only active group chats can be configured.');
    }
    const role = state.context.memberRole ?? 'owner';

    let updated = false;
    for (let attempts = 0; attempts < 5; attempts += 1) {
      const inviteCode = createGroupInviteCode();
      try {
        await pool.query<ResultSetHeader>(
          'UPDATE chats SET group_invite_code = ?, group_invite_code_updated_at = ?, updated_at = ? WHERE id = ?',
          [inviteCode, now, now, chatId]
        );
        updated = true;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (!message.includes('Duplicate entry')) {
          throw error;
        }
      }
    }

    if (!updated) {
      throw new Error('Invite link could not be regenerated.');
    }
    await this.appendGroupModerationLog(chatId, 'invite_link_regenerated', userId);

    const next = await this.getGroupChatControl(chatId);
    if (!next) {
      throw new Error('Group settings could not be loaded.');
    }
    return this.buildGroupSettings(next, role);
  }

  async closeGroupChat(userId: string, chatId: string): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    const state = await this.assertGroupCapability(userId, chatId, 'close_group', 'Only group owner can close the group.');
    const chat = state.chat;
    if (!chat?.id || chat.chat_type !== 'group' || asNullableNumber(chat.deactivated_at)) {
      throw new Error('Only active group chats can be closed.');
    }

    await pool.query<ResultSetHeader>(
      'UPDATE chats SET deactivated_at = ?, deactivated_by = ?, updated_at = ? WHERE id = ?',
      [now, userId, now, chatId]
    );
    await this.appendGroupModerationLog(chatId, 'group_closed', userId);
  }

  async listGroupModerationLogs(userId: string, chatId: string, limit = 80): Promise<AppModerationLog[]> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const state = await this.assertGroupCapability(userId, chatId, 'view_moderation_logs', 'Insufficient group permissions.');
    const chat = state.chat;
    if (!chat?.id || chat.chat_type !== 'group') {
      throw new Error('Only group chats are supported.');
    }

    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const [rows] = await pool.query<GroupModerationLogRow[]>(
      `
        SELECT
          l.id,
          l.chat_id,
          l.action,
          l.actor_user_id,
          aa.username AS actor_username,
          aa.first_name AS actor_first_name,
          aa.last_name AS actor_last_name,
          l.target_user_id,
          ta.username AS target_username,
          ta.first_name AS target_first_name,
          ta.last_name AS target_last_name,
          l.message_id,
          l.details_json,
          l.created_at
        FROM group_moderation_logs l
        JOIN auth_accounts aa ON aa.user_id = l.actor_user_id
        LEFT JOIN auth_accounts ta ON ta.user_id = l.target_user_id
        WHERE l.chat_id = ?
        ORDER BY l.created_at DESC
        LIMIT ?
      `,
      [chatId, safeLimit]
    );

    return rows.map((row) => {
      let details: Record<string, unknown> | null = null;
      if (row.details_json) {
        try {
          const parsed = JSON.parse(row.details_json) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            details = parsed as Record<string, unknown>;
          }
        } catch {
          details = null;
        }
      }
      const actorName = `${row.actor_first_name ?? ''} ${row.actor_last_name ?? ''}`.trim() || row.actor_username;
      const targetNameRaw = `${row.target_first_name ?? ''} ${row.target_last_name ?? ''}`.trim();
      return {
        id: row.id,
        chatId: row.chat_id,
        action: row.action,
        actorUserId: row.actor_user_id,
        actorName,
        targetUserId: row.target_user_id ?? null,
        targetName: row.target_user_id ? (targetNameRaw || row.target_username || null) : null,
        messageId: row.message_id ?? null,
        details,
        createdAt: asNumber(row.created_at)
      };
    });
  }

  private mapModerationReport(row: ModerationReportRow): AppModerationReport {
    return {
      id: row.id,
      chatId: row.chat_id,
      status: toModerationReportStatus(row.status),
      reason: toModerationReportReason(row.reason),
      reporterUserId: row.reporter_user_id,
      reporterName: fullNameFromParts(row.reporter_username, row.reporter_first_name, row.reporter_last_name),
      targetUserId: row.target_user_id ?? null,
      targetName: row.target_user_id
        ? fullNameFromParts(row.target_username, row.target_first_name, row.target_last_name)
        : null,
      messageId: row.message_id ?? null,
      messagePreview: row.message_text?.trim().slice(0, 180) || null,
      notes: row.notes?.trim() || null,
      decisionNotes: row.decision_notes?.trim() || null,
      decidedByUserId: row.decided_by_user_id ?? null,
      decidedByName: row.decided_by_user_id
        ? fullNameFromParts(row.decided_by_username, row.decided_by_first_name, row.decided_by_last_name)
        : null,
      decidedAt: asNullableNumber(row.decided_at),
      createdAt: asNumber(row.created_at),
      updatedAt: asNumber(row.updated_at)
    };
  }

  async createModerationReport(
    userId: string,
    chatId: string,
    input: {
      messageId?: string | null;
      targetUserId?: string | null;
      reason: AppModerationReportReason;
      notes?: string | null;
    }
  ): Promise<AppModerationReport> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    const state = await this.assertGroupCapability(userId, chatId, 'view_chat', 'Chat not accessible.');
    const chat = state.chat;
    if (!chat?.id || chat.chat_type !== 'group' || asNullableNumber(chat.deactivated_at)) {
      throw new Error('Only active group chats support reports.');
    }

    const messageId = input.messageId?.trim() || null;
    const targetUserId = input.targetUserId?.trim() || null;
    const reason = toModerationReportReason(input.reason);
    const notes = input.notes?.trim().slice(0, 500) || null;

    if (!messageId && !targetUserId) {
      throw new Error('Report target is required.');
    }

    let resolvedTargetUserId = targetUserId;
    let messagePreview: string | null = null;

    if (messageId) {
      const messageRow = await this.loadMessageRow(chatId, messageId);
      if (!messageRow) {
        throw new Error('Message not found.');
      }
      resolvedTargetUserId = resolvedTargetUserId ?? messageRow.user_id;
      messagePreview = messageRow.text?.trim().slice(0, 180) || null;
    }

    if (resolvedTargetUserId) {
      const targetRole = await this.getMembershipRole(resolvedTargetUserId, chatId);
      if (!targetRole) {
        throw new Error('Target user is not part of this group.');
      }
    }

    if (resolvedTargetUserId === userId) {
      throw new Error('You cannot report yourself.');
    }

    const [existingRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT id
        FROM moderation_reports
        WHERE chat_id = ?
          AND reporter_user_id = ?
          AND COALESCE(target_user_id, '') = COALESCE(?, '')
          AND COALESCE(message_id, '') = COALESCE(?, '')
          AND reason = ?
          AND status IN ('open', 'reviewing')
        LIMIT 1
      `,
      [chatId, userId, resolvedTargetUserId, messageId, reason]
    );
    if (existingRows.length > 0) {
      throw new Error('An active report for this target already exists.');
    }

    const reportId = randomUUID();
    await pool.query<ResultSetHeader>(
      `
        INSERT INTO moderation_reports (
          id,
          chat_id,
          reporter_user_id,
          target_user_id,
          message_id,
          status,
          reason,
          notes,
          decision_notes,
          decided_by_user_id,
          decided_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'open', ?, ?, NULL, NULL, NULL, ?, ?)
      `,
      [reportId, chatId, userId, resolvedTargetUserId, messageId, reason, notes, now, now]
    );

    await this.appendGroupModerationLog(chatId, 'report_created', userId, {
      targetUserId: resolvedTargetUserId,
      messageId,
      details: {
        reportId,
        reason,
        notes,
        messagePreview
      }
    });

    const report = await this.getModerationReportById(chatId, reportId);
    if (!report) {
      throw new Error('Report could not be loaded.');
    }
    return report;
  }

  private async getModerationReportById(chatId: string, reportId: string): Promise<AppModerationReport | null> {
    const pool = getMysqlPool();
    const [rows] = await pool.query<ModerationReportRow[]>(
      `
        SELECT
          r.id,
          r.chat_id,
          r.status,
          r.reason,
          r.reporter_user_id,
          ra.username AS reporter_username,
          ra.first_name AS reporter_first_name,
          ra.last_name AS reporter_last_name,
          r.target_user_id,
          ta.username AS target_username,
          ta.first_name AS target_first_name,
          ta.last_name AS target_last_name,
          r.message_id,
          m.text AS message_text,
          r.notes,
          r.decision_notes,
          r.decided_by_user_id,
          da.username AS decided_by_username,
          da.first_name AS decided_by_first_name,
          da.last_name AS decided_by_last_name,
          r.decided_at,
          r.created_at,
          r.updated_at
        FROM moderation_reports r
        JOIN auth_accounts ra ON ra.user_id = r.reporter_user_id
        LEFT JOIN auth_accounts ta ON ta.user_id = r.target_user_id
        LEFT JOIN auth_accounts da ON da.user_id = r.decided_by_user_id
        LEFT JOIN messages m ON m.id = r.message_id
        WHERE r.chat_id = ?
          AND r.id = ?
        LIMIT 1
      `,
      [chatId, reportId]
    );
    const row = rows[0] ?? null;
    return row ? this.mapModerationReport(row) : null;
  }

  async listModerationReports(
    userId: string,
    chatId: string,
    options?: {
      status?: AppModerationReportStatus | 'all';
      limit?: number;
    }
  ): Promise<AppModerationReport[]> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const state = await this.assertGroupCapability(userId, chatId, 'view_moderation_logs', 'Insufficient group permissions.');
    const chat = state.chat;
    if (!chat?.id || chat.chat_type !== 'group') {
      throw new Error('Only group chats are supported.');
    }

    const limit = Math.max(1, Math.min(200, Math.floor(options?.limit ?? 100)));
    const status = options?.status && options.status !== 'all' ? toModerationReportStatus(options.status) : null;
    const [rows] = await pool.query<ModerationReportRow[]>(
      `
        SELECT
          r.id,
          r.chat_id,
          r.status,
          r.reason,
          r.reporter_user_id,
          ra.username AS reporter_username,
          ra.first_name AS reporter_first_name,
          ra.last_name AS reporter_last_name,
          r.target_user_id,
          ta.username AS target_username,
          ta.first_name AS target_first_name,
          ta.last_name AS target_last_name,
          r.message_id,
          m.text AS message_text,
          r.notes,
          r.decision_notes,
          r.decided_by_user_id,
          da.username AS decided_by_username,
          da.first_name AS decided_by_first_name,
          da.last_name AS decided_by_last_name,
          r.decided_at,
          r.created_at,
          r.updated_at
        FROM moderation_reports r
        JOIN auth_accounts ra ON ra.user_id = r.reporter_user_id
        LEFT JOIN auth_accounts ta ON ta.user_id = r.target_user_id
        LEFT JOIN auth_accounts da ON da.user_id = r.decided_by_user_id
        LEFT JOIN messages m ON m.id = r.message_id
        WHERE r.chat_id = ?
          AND (? IS NULL OR r.status = ?)
        ORDER BY
          FIELD(r.status, 'open', 'reviewing', 'resolved', 'dismissed'),
          r.updated_at DESC
        LIMIT ?
      `,
      [chatId, status, status, limit]
    );
    return rows.map((row) => this.mapModerationReport(row));
  }

  async decideModerationReport(
    userId: string,
    chatId: string,
    reportId: string,
    input: {
      status: AppModerationReportStatus;
      decisionNotes?: string | null;
      moderationAction?: 'mute_1h' | 'mute_24h' | 'ban' | 'unmute' | 'unban' | null;
    }
  ): Promise<AppModerationReport> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    await this.assertGroupCapability(userId, chatId, 'moderate_messages', 'Insufficient group permissions.');

    const nextStatus = toModerationReportStatus(input.status);
    const decisionNotes = input.decisionNotes?.trim().slice(0, 500) || null;
    const moderationAction = input.moderationAction ?? null;
    const current = await this.getModerationReportById(chatId, reportId);
    if (!current) {
      throw new Error('Report not found.');
    }
    if (moderationAction && !current.targetUserId) {
      throw new Error('This report has no actionable target user.');
    }

    await pool.query<ResultSetHeader>(
      `
        UPDATE moderation_reports
        SET
          status = ?,
          decision_notes = ?,
          decided_by_user_id = ?,
          decided_at = ?,
          updated_at = ?
        WHERE id = ?
          AND chat_id = ?
      `,
      [nextStatus, decisionNotes, userId, now, now, reportId, chatId]
    );

    if (moderationAction && current.targetUserId) {
      await this.manageGroupMember(userId, chatId, current.targetUserId, moderationAction, null, decisionNotes);
    }

    await this.appendGroupModerationLog(chatId, 'report_status_changed', userId, {
      targetUserId: current.targetUserId,
      messageId: current.messageId,
      details: {
        reportId,
        previousStatus: current.status,
        nextStatus,
        decisionNotes,
        moderationAction
      }
    });

    const updated = await this.getModerationReportById(chatId, reportId);
    if (!updated) {
      throw new Error('Report could not be loaded.');
    }
    return updated;
  }

  async joinGroupByInviteCode(userId: string, inviteCode: string): Promise<AppChatSummary> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    const normalizedCode = inviteCode.trim();
    if (!normalizedCode) {
      throw new Error('Invite code is required.');
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `
        SELECT id
        FROM chats
        WHERE chat_type = 'group'
          AND deactivated_at IS NULL
          AND group_invite_mode = 'invite_link'
          AND group_invite_code = ?
        LIMIT 1
      `,
      [normalizedCode]
    );
    const chatId = String(rows[0]?.id ?? '');
    if (!chatId) {
      throw new Error('Invite link is invalid.');
    }
    await this.assertGroupUserNotBanned(chatId, userId);

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO chat_memberships (chat_id, user_id, joined_at, member_role, left_at)
        VALUES (?, ?, ?, 'member', NULL)
        ON DUPLICATE KEY UPDATE left_at = NULL
      `,
      [chatId, userId, now]
    );
    await pool.query<ResultSetHeader>('UPDATE chats SET updated_at = ? WHERE id = ?', [now, chatId]);

    const chats = await this.listChats(userId);
    const chat = chats.find((item) => item.id === chatId);
    if (!chat) {
      throw new Error('Group chat could not be loaded.');
    }
    return chat;
  }

  async getChatContext(userId: string, chatId: string): Promise<AppChatContext | null> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();

    const role = await this.getMembershipRole(userId, chatId);
    if (!role) {
      return null;
    }

    const [readRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT last_read_at
        FROM chat_reads
        WHERE chat_id = ?
          AND user_id = ?
        LIMIT 1
      `,
      [chatId, userId]
    );
    const previousReadAt = asNumber(readRows[0]?.last_read_at, 0);

    const chats = await this.listChats(userId);
    const chat = chats.find((item) => item.id === chatId) ?? null;
    if (!chat) {
      return null;
    }
    const groupChat = chat.kind === 'group' ? await this.getGroupChatControl(chatId) : null;
    const visibleAfter = chat.groupAutoHideAfter24h ? now - 24 * 60 * 60 * 1000 : 0;

    const [memberRows] = await pool.query<ChatMemberRow[]>(
      `
        SELECT
          a.user_id,
          a.username,
          a.first_name,
          a.last_name,
          a.bio,
          a.email,
          a.global_role,
          a.accent_color,
          a.chat_background,
          a.avatar_updated_at,
          cm.joined_at,
          cm.member_role,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM auth_sessions s
              WHERE s.user_id = cm.user_id
                AND s.expires_at > ?
                AND s.last_seen_at >= ?
            ) THEN 1
            ELSE 0
          END AS is_online
        FROM chat_memberships cm
        JOIN auth_accounts a ON a.user_id = cm.user_id
        WHERE cm.chat_id = ?
          AND cm.left_at IS NULL
        ORDER BY
          cm.member_role = 'owner' DESC,
          cm.member_role = 'admin' DESC,
          cm.member_role = 'moderator' DESC,
          a.username ASC
      `,
      [now, now - CHAT_LIMITS.userOnlineTtlMs, chatId]
    );

    const displayNames = await this.loadResolvedNicknamesForChat(chatId, memberRows.map((row) => row.user_id));
    const members: AppChatMember[] = memberRows.map((row) => ({
      user: mapProfile(row, { includeEmail: row.user_id === userId, displayName: displayNames.get(row.user_id) }),
      joinedAt: asNumber(row.joined_at),
      role: row.member_role,
      isOnline: asNumber(row.is_online) === 1,
      mutedUntil: asNullableNumber(row.muted_until),
      banActive: Boolean(asNullableNumber(row.banned_at)),
      moderationNote: row.ban_reason?.trim() || row.mute_reason?.trim() || null
    }));

    const [messageRows] = await pool.query<MessageRow[]>(
      `
        SELECT
          m.id,
          m.chat_id,
          m.user_id,
          m.text,
          m.created_at,
          m.attachments_json,
          a.username,
          a.first_name,
          a.last_name,
          a.bio,
          a.email,
          a.global_role,
          a.accent_color,
          a.chat_background,
          a.avatar_updated_at
        FROM (
          SELECT id, chat_id, user_id, text, created_at, attachments_json
          FROM messages
          WHERE chat_id = ?
            AND created_at >= ?
          ORDER BY created_at DESC
          LIMIT 120
        ) m
        JOIN auth_accounts a ON a.user_id = m.user_id
        ORDER BY m.created_at ASC
      `,
      [chatId, visibleAfter]
    );

    const messages = await this.mapRowsToMessages(messageRows, userId);

    let unreadCountAtOpen = 0;
    let firstUnreadMessageId: string | null = null;
    for (const message of messages) {
      if (message.createdAt <= previousReadAt) {
        continue;
      }
      unreadCountAtOpen += 1;
      if (!firstUnreadMessageId) {
        firstUnreadMessageId = message.id;
      }
    }

    await this.markChatRead(userId, chatId, now);

    return {
      chat,
      members,
      messages,
      unreadCountAtOpen,
      firstUnreadMessageId,
      groupSettings: groupChat ? this.buildGroupSettings(groupChat, role) : null
    };
  }

  private async loadMessageRow(chatId: string, messageId: string): Promise<MessageRow | null> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<MessageRow[]>(
      `
        SELECT
          m.id,
          m.chat_id,
          m.user_id,
          m.text,
          m.created_at,
          m.attachments_json,
          a.username,
          a.first_name,
          a.last_name,
          a.bio,
          a.email,
          a.global_role,
          a.avatar_updated_at
        FROM messages m
        JOIN auth_accounts a ON a.user_id = m.user_id
        WHERE m.chat_id = ?
          AND m.id = ?
        LIMIT 1
      `,
      [chatId, messageId]
    );

    return rows[0] ?? null;
  }

  private buildPreviewText(input: AddMessageInput, attachments: AppChatAttachment[]): string {
    const text = (input.text ?? '').trim();
    if (text) {
      return text;
    }

    if (input.poll?.question?.trim()) {
      return `[Umfrage] ${input.poll.question.trim()}`.slice(0, 4000);
    }

    if (input.gif?.url?.trim()) {
      return '[GIF]';
    }

    if (attachments.length === 1) {
      return `Anhang: ${attachments[0].fileName}`.slice(0, 4000);
    }
    if (attachments.length > 1) {
      return `[${attachments.length} Anhaenge]`;
    }

    return '';
  }

  private async resolveMentionUserIds(
    chatId: string,
    chatType: 'global' | 'group' | 'direct',
    senderUserId: string,
    senderRole: GroupMemberRole,
    senderGlobalRole: GlobalRole,
    messageText: string,
    everyonePolicy: GroupMentionPolicy,
    herePolicy: GroupMentionPolicy
  ): Promise<string[]> {
    await this.ensureReady();
    const trimmedText = messageText.trim();
    if (!trimmedText || !trimmedText.includes('@')) {
      return [];
    }

    const shouldPingEveryone = hasMentionToken(trimmedText, 'everyone');
    const shouldPingHere = hasMentionToken(trimmedText, 'here');
    const canUseGlobalBroadcastMentions = senderGlobalRole === 'admin' || senderGlobalRole === 'superadmin';
    if (chatType === 'global' && (shouldPingEveryone || shouldPingHere) && !canUseGlobalBroadcastMentions) {
      throw new Error('Only admins and superadmins can use @everyone or @here in global chat.');
    }
    const groupPermissionContext: GroupPermissionContext = {
      memberRole: senderRole,
      globalRole: senderGlobalRole,
      everyoneMentionPolicy: everyonePolicy,
      hereMentionPolicy: herePolicy
    };
    if (chatType === 'group' && shouldPingEveryone && !hasGroupCapability(groupPermissionContext, 'use_everyone_mention')) {
      throw new Error('You are not allowed to use @everyone in this group.');
    }
    if (chatType === 'group' && shouldPingHere && !hasGroupCapability(groupPermissionContext, 'use_here_mention')) {
      throw new Error('You are not allowed to use @here in this group.');
    }

    const pool = getMysqlPool();
    const now = Date.now();
    const [rows] = await pool.query<RowDataPacket[]>(
      `
        SELECT
          cm.user_id,
          a.username,
          a.first_name,
          a.last_name,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM auth_sessions s
              WHERE s.user_id = cm.user_id
                AND s.expires_at > ?
                AND s.last_seen_at >= ?
            ) THEN 1
            ELSE 0
          END AS is_online
        FROM chat_memberships cm
        JOIN auth_accounts a ON a.user_id = cm.user_id
        WHERE cm.chat_id = ?
          AND cm.left_at IS NULL
      `,
      [now, now - CHAT_LIMITS.userOnlineTtlMs, chatId]
    );

    const mentionUserIds = new Set<string>();
    for (const row of rows) {
      const memberUserId = String(row.user_id ?? '').trim();
      const username = String(row.username ?? '').trim();
      const firstName = String(row.first_name ?? '').trim();
      const lastName = String(row.last_name ?? '').trim();
      const fullName = `${firstName} ${lastName}`.trim();
      if (!memberUserId || memberUserId === senderUserId) {
        continue;
      }
      if (
        (username && hasUserMention(trimmedText, username)) ||
        (fullName && hasFullNameMention(trimmedText, fullName))
      ) {
        mentionUserIds.add(memberUserId);
      }
    }

    if (shouldPingEveryone || shouldPingHere) {
      for (const row of rows) {
        const memberUserId = String(row.user_id ?? '').trim();
        if (!memberUserId || memberUserId === senderUserId) {
          continue;
        }
        const isOnline = asNumber(row.is_online) === 1;
        if (shouldPingEveryone || (shouldPingHere && isOnline)) {
          mentionUserIds.add(memberUserId);
        }
      }
    }

    return [...mentionUserIds];
  }

  private async cleanupUploads(now = Date.now()): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const minUploadedAt = now - CHAT_LIMITS.uploadTtlMs;
    await pool.query<ResultSetHeader>('DELETE FROM uploads WHERE uploaded_at < ?', [minUploadedAt]);
  }

  private async enforceUploadLimit(): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [countRows] = await pool.query<CountRow[]>('SELECT COUNT(*) AS total FROM uploads');
    const total = asNumber(countRows[0]?.total);
    if (total <= CHAT_LIMITS.maxUploadsInMemory) {
      return;
    }

    const overflow = total - CHAT_LIMITS.maxUploadsInMemory;
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM uploads ORDER BY uploaded_at ASC LIMIT ?', [overflow]);
    const ids = rows.map((row) => String(row.id ?? '')).filter((id) => id.length > 0);
    if (ids.length === 0) {
      return;
    }

    const placeholders = ids.map(() => '?').join(',');
    await pool.query<ResultSetHeader>(`DELETE FROM uploads WHERE id IN (${placeholders})`, ids);
  }

  async storeUpload(
    userId: string,
    chatId: string,
    file: { fileName: string; mimeType: string; size: number; buffer: Buffer }
  ): Promise<AppChatAttachment> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const role = await this.getMembershipRole(userId, chatId);
    if (!role) {
      throw new Error('Chat not accessible.');
    }

    if (file.size <= 0 || file.size > CHAT_LIMITS.uploadMaxBytes) {
      throw new Error('Upload size is invalid.');
    }

    const now = Date.now();
    await this.cleanupUploads(now);

    const [sumRows] = await pool.query<CountRow[]>('SELECT COALESCE(SUM(size), 0) AS total FROM uploads');
    const totalBytes = asNumber(sumRows[0]?.total);
    if (totalBytes + file.size > CHAT_LIMITS.uploadMaxTotalBytes) {
      throw new Error('Upload storage limit reached.');
    }

    const id = randomUUID();
    const safeName = file.fileName.replace(/[\\/\r\n]/g, '_').slice(0, 140) || 'upload.bin';
    await pool.query<ResultSetHeader>(
      `
        INSERT INTO uploads (id, chat_id, file_name, mime_type, size, uploaded_by, uploaded_at, buffer)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [id, chatId, safeName, file.mimeType.slice(0, 255) || 'application/octet-stream', file.size, userId, now, file.buffer]
    );
    await this.enforceUploadLimit();

    return {
      id,
      fileName: safeName,
      mimeType: file.mimeType.slice(0, 255) || 'application/octet-stream',
      size: file.size,
      uploadedAt: now,
      uploadedBy: userId
    };
  }

  async getUploadForUser(userId: string, fileId: string): Promise<UploadRow | null> {
    await this.ensureReady();
    const pool = getMysqlPool();
    await this.cleanupUploads(Date.now());

    const [rows] = await pool.query<UploadRow[]>(
      `
        SELECT id, chat_id, file_name, mime_type, size, uploaded_by, uploaded_at, buffer
        FROM uploads
        WHERE id = ?
        LIMIT 1
      `,
      [fileId]
    );
    const upload = rows[0] ?? null;
    if (!upload) {
      return null;
    }

    const role = await this.getMembershipRole(userId, upload.chat_id);
    if (!role) {
      return null;
    }
    return upload;
  }

  async addMessage(userId: string, chatId: string, input: AddMessageInput, ip?: string): Promise<AppChatMessage> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    const ipNorm = normalizeIp(ip ?? '');
    if (ipNorm) {
      await this.assertIpAllowed(ipNorm, 'chat');
      await this.enforceIpRateLimit(ipNorm, `chat:${chatId}`, CHAT_LIMITS.spamLongWindowLimit * 3, CHAT_LIMITS.spamLongWindowMs, 'chat-rate');
    }
    const role = await this.getMembershipRole(userId, chatId);
    if (!role) {
      throw new Error('Chat not accessible.');
    }
    await this.assertGroupUserCanPost(chatId, userId);

    const account = await this.getAccountByUserId(userId);
    if (!account) {
      throw new Error('User account not found.');
    }

    const [chatRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT
          name,
          chat_type,
          group_everyone_mention_policy,
          group_here_mention_policy,
          group_message_cooldown_ms
        FROM chats
        WHERE id = ?
          AND deactivated_at IS NULL
        LIMIT 1
      `,
      [chatId]
    );
    const chatRow = chatRows[0];
    if (!chatRow?.name) {
      throw new Error('Chat not found.');
    }
    const chatType = chatRow.chat_type === 'global' || chatRow.chat_type === 'direct' ? chatRow.chat_type : 'group';
    const groupMessageCooldownMs = normalizeGroupMessageCooldownMs(
      asNumber(chatRow.group_message_cooldown_ms, CHAT_LIMITS.defaultGroupMessageCooldownMs)
    );

    try {
      await this.enforceMessageSpamProtection(userId, chatId, now);
    } catch (error) {
      if (error instanceof MessageSpamError && ipNorm) {
        await this.registerIpAbuse(ipNorm, 'message-spam', 2);
      }
      throw error;
    }

    await this.enforceGroupMessageCooldown(userId, chatId, chatType, role, account.global_role, groupMessageCooldownMs, now);

    const attachmentIds = normalizeIds(input.attachmentIds ?? []).slice(0, 8);
    let attachments: AppChatAttachment[] = [];
    if (attachmentIds.length > 0) {
      const placeholders = attachmentIds.map(() => '?').join(',');
      const [uploadRows] = await pool.query<UploadRow[]>(
        `
          SELECT id, chat_id, file_name, mime_type, size, uploaded_by, uploaded_at, buffer
          FROM uploads
          WHERE id IN (${placeholders})
            AND chat_id = ?
            AND uploaded_by = ?
        `,
        [...attachmentIds, chatId, userId]
      );

      attachments = uploadRows.map((row) => ({
        id: row.id,
        fileName: row.file_name,
        mimeType: row.mime_type,
        size: asNumber(row.size),
        uploadedAt: asNumber(row.uploaded_at),
        uploadedBy: row.uploaded_by
      }));
      if (attachments.length !== attachmentIds.length) {
        throw new Error('One or more attachments are invalid.');
      }
    }

    const pollInput = input.poll && input.poll.question.trim() ? input.poll : null;
    let storedPoll: StoredMessageMeta['poll'] = null;
    if (pollInput) {
      const question = pollInput.question.trim().slice(0, 160);
      const optionTexts = [...new Set((pollInput.options ?? []).map((item) => item.trim()).filter((item) => item.length > 0))].slice(0, 10);
      if (!question || optionTexts.length < 2) {
        throw new Error('Invalid poll payload.');
      }
      storedPoll = {
        question,
        options: optionTexts.map((text) => ({ id: randomUUID(), text: text.slice(0, 120), voterIds: [] })),
        closed: false
      };
    }

    const gifInput = input.gif && input.gif.url.trim()
      ? {
          url: input.gif.url.trim().slice(0, 1000),
          previewUrl: input.gif.previewUrl?.trim().slice(0, 1000) || null,
          tenorId: input.gif.tenorId?.trim().slice(0, 80) || null,
          title: input.gif.title?.trim().slice(0, 160) || null
        }
      : null;

    let replyTo: StoredMessageMeta['replyTo'] = null;
    const replyToMessageId = input.replyToMessageId?.trim() ?? '';
    if (replyToMessageId) {
      const replyRow = await this.loadMessageRow(chatId, replyToMessageId);
      if (replyRow) {
        const replyMeta = parseMessageMeta(replyRow.attachments_json);
        const replyAuthor = mapProfile(replyRow).fullName;
        let snippet = '';
        if (replyMeta.deletedForAll) {
          snippet = '[Nachricht geloescht]';
        } else if (replyRow.text.trim()) {
          snippet = replyRow.text.trim();
        } else if ((replyMeta.attachments ?? []).length > 0) {
          snippet = '[Anhang]';
        } else if (replyMeta.gif?.url) {
          snippet = '[GIF]';
        } else if (replyMeta.poll?.question) {
          snippet = `[Umfrage] ${replyMeta.poll.question}`;
        } else {
          snippet = '[Nachricht]';
        }

        replyTo = {
          id: replyRow.id,
          authorName: replyAuthor,
          textSnippet: snippet.slice(0, 160)
        };
      }
    }

    const messageText = this.buildPreviewText(input, attachments).slice(0, 4000);
    if (!messageText && attachments.length === 0 && !storedPoll && !gifInput) {
      throw new Error('Message cannot be empty.');
    }

    const duplicate = await this.findDuplicateRecentMessage(userId, chatId, now, {
      text: messageText,
      replyToMessageId: replyToMessageId || null,
      attachmentIds: attachments.map((attachment) => attachment.id).sort(),
      gifUrl: gifInput?.url ?? null,
      pollQuestion: storedPoll?.question ?? null,
      pollOptions: (storedPoll?.options ?? []).map((option) => option.text).sort()
    });
    if (duplicate) {
      const existing = await this.mapRowToMessage(duplicate, userId);
      if (existing) {
        return existing;
      }
    }

    const mentionUserIds = await this.resolveMentionUserIds(
      chatId,
      chatType,
      userId,
      role,
      account.global_role,
      messageText,
      toGroupMentionPolicy(chatRow.group_everyone_mention_policy),
      toGroupMentionPolicy(chatRow.group_here_mention_policy)
    );

    const meta: StoredMessageMeta = {
      attachments,
      gif: gifInput,
      poll: storedPoll,
      reactions: {},
      mentionUserIds,
      replyTo,
      hiddenForUserIds: [],
      editedAt: null,
      deletedForAll: null
    };

    const messageId = randomUUID();
    const displayName = `${account.first_name} ${account.last_name}`.trim() || account.username;

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO messages (id, chat_id, chat_name, user_id, user_name, text, created_at, attachments_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [messageId, chatId, String(chatRow.name), userId, displayName.slice(0, 64), messageText, now, JSON.stringify(meta)]
    );
    await pool.query<ResultSetHeader>('UPDATE chats SET updated_at = ? WHERE id = ?', [now, chatId]);
    await this.markChatRead(userId, chatId, now);
    await this.setTyping(userId, chatId, false);

    const row = await this.loadMessageRow(chatId, messageId);
    if (!row) {
      throw new Error('Message could not be loaded.');
    }
    const message = await this.mapRowToMessage(row, userId);
    if (!message) {
      throw new Error('Message could not be loaded.');
    }
    return message;
  }

  private async canDeleteMessageForAll(actorUserId: string, chatId: string, authorUserId: string): Promise<boolean> {
    if (actorUserId === authorUserId) {
      return true;
    }
    const state = await this.getGroupPermissionState(actorUserId, chatId);
    return Boolean(state && hasGroupCapability(state.context, 'delete_message_for_all'));
  }

  private async canPinMessage(actorUserId: string, chatId: string): Promise<boolean> {
    const state = await this.getGroupPermissionState(actorUserId, chatId);
    return Boolean(state && hasGroupCapability(state.context, 'pin_messages'));
  }

  private async appendGroupModerationLog(
    chatId: string,
    action: string,
    actorUserId: string,
    options?: {
      targetUserId?: string | null;
      messageId?: string | null;
      details?: Record<string, unknown> | null;
    }
  ): Promise<void> {
    const chat = await this.getGroupChatControl(chatId);
    if (!chat?.id || chat.chat_type !== 'group') {
      return;
    }
    const pool = getMysqlPool();
    await pool.query<ResultSetHeader>(
      `
        INSERT INTO group_moderation_logs (id, chat_id, action, actor_user_id, target_user_id, message_id, details_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        randomUUID(),
        chatId,
        action.slice(0, 64),
        actorUserId,
        options?.targetUserId ?? null,
        options?.messageId ?? null,
        options?.details ? JSON.stringify(options.details) : null,
        Date.now()
      ]
    );
  }

  async editMessage(userId: string, chatId: string, messageId: string, text: string): Promise<AppChatMessage> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const role = await this.getMembershipRole(userId, chatId);
    if (!role) {
      throw new Error('Chat not accessible.');
    }

    const row = await this.loadMessageRow(chatId, messageId);
    if (!row) {
      throw new Error('Message not found.');
    }
    if (row.user_id !== userId) {
      throw new Error('Only author can edit message.');
    }

    const meta = parseMessageMeta(row.attachments_json);
    if (meta.deletedForAll) {
      throw new Error('Message already deleted.');
    }
    meta.editedAt = Date.now();

    await pool.query<ResultSetHeader>('UPDATE messages SET text = ?, attachments_json = ? WHERE id = ? AND chat_id = ?', [
      text,
      JSON.stringify(meta),
      messageId,
      chatId
    ]);
    await this.appendGroupModerationLog(chatId, 'message_edited', userId, {
      messageId
    });

    const next = await this.loadMessageRow(chatId, messageId);
    if (!next) {
      throw new Error('Message not found.');
    }
    const message = await this.mapRowToMessage(next, userId);
    if (!message) {
      throw new Error('Message not available.');
    }
    return message;
  }

  async deleteMessage(
    userId: string,
    chatId: string,
    messageId: string,
    scope: 'me' | 'all'
  ): Promise<{ removedForMe: boolean; message: AppChatMessage | null }> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const role = await this.getMembershipRole(userId, chatId);
    if (!role) {
      throw new Error('Chat not accessible.');
    }

    const row = await this.loadMessageRow(chatId, messageId);
    if (!row) {
      throw new Error('Message not found.');
    }

    const meta = parseMessageMeta(row.attachments_json);
    if (scope === 'all') {
      const canDeleteForAll = await this.canDeleteMessageForAll(userId, chatId, row.user_id);
      if (!canDeleteForAll) {
        throw new PermissionDeniedError('No permission to delete for all.');
      }

      meta.deletedForAll = {
        by: userId,
        at: Date.now()
      };
      meta.attachments = [];
      meta.gif = null;
      meta.poll = null;
      meta.reactions = {};

      await pool.query<ResultSetHeader>('UPDATE messages SET text = ?, attachments_json = ? WHERE id = ? AND chat_id = ?', [
        '',
        JSON.stringify(meta),
        messageId,
        chatId
      ]);
      await this.appendGroupModerationLog(chatId, 'message_deleted_for_all', userId, {
        targetUserId: row.user_id,
        messageId
      });

      const next = await this.loadMessageRow(chatId, messageId);
      if (!next) {
        return { removedForMe: false, message: null };
      }
      return {
        removedForMe: false,
        message: await this.mapRowToMessage(next, userId)
      };
    }

    const hidden = new Set(meta.hiddenForUserIds ?? []);
    hidden.add(userId);
    meta.hiddenForUserIds = [...hidden];
    await pool.query<ResultSetHeader>('UPDATE messages SET attachments_json = ? WHERE id = ? AND chat_id = ?', [
      JSON.stringify(meta),
      messageId,
      chatId
    ]);
    return { removedForMe: true, message: null };
  }

  async votePoll(userId: string, chatId: string, messageId: string, optionId: string): Promise<AppChatMessage> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const role = await this.getMembershipRole(userId, chatId);
    if (!role) {
      throw new Error('Chat not accessible.');
    }

    const row = await this.loadMessageRow(chatId, messageId);
    if (!row) {
      throw new Error('Message not found.');
    }

    const meta = parseMessageMeta(row.attachments_json);
    if (!meta.poll || meta.poll.closed) {
      throw new Error('Poll not available.');
    }

    let found = false;
    for (const option of meta.poll.options) {
      option.voterIds = option.voterIds.filter((id) => id !== userId);
      if (option.id === optionId) {
        option.voterIds.push(userId);
        found = true;
      }
    }
    if (!found) {
      throw new Error('Poll option not found.');
    }

    await pool.query<ResultSetHeader>('UPDATE messages SET attachments_json = ? WHERE id = ? AND chat_id = ?', [
      JSON.stringify(meta),
      messageId,
      chatId
    ]);
    await this.appendGroupModerationLog(chatId, meta.pinned ? 'message_pinned' : 'message_unpinned', userId, {
      targetUserId: row.user_id,
      messageId
    });

    const next = await this.loadMessageRow(chatId, messageId);
    if (!next) {
      throw new Error('Message not found.');
    }
    const message = await this.mapRowToMessage(next, userId);
    if (!message) {
      throw new Error('Message not available.');
    }
    return message;
  }

  async toggleReaction(userId: string, chatId: string, messageId: string, emoji: string): Promise<AppChatMessage> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const role = await this.getMembershipRole(userId, chatId);
    if (!role) {
      throw new Error('Chat not accessible.');
    }

    const row = await this.loadMessageRow(chatId, messageId);
    if (!row) {
      throw new Error('Message not found.');
    }

    const meta = parseMessageMeta(row.attachments_json);
    if (meta.deletedForAll) {
      throw new Error('Message already deleted.');
    }
    const key = emoji.trim();
    if (!key) {
      throw new Error('Emoji is required.');
    }

    const reactions = meta.reactions ?? {};
    const voters = new Set(reactions[key] ?? []);
    if (voters.has(userId)) {
      voters.delete(userId);
    } else {
      voters.add(userId);
    }
    if (voters.size === 0) {
      delete reactions[key];
    } else {
      reactions[key] = [...voters];
    }
    meta.reactions = reactions;

    await pool.query<ResultSetHeader>('UPDATE messages SET attachments_json = ? WHERE id = ? AND chat_id = ?', [
      JSON.stringify(meta),
      messageId,
      chatId
    ]);

    const next = await this.loadMessageRow(chatId, messageId);
    if (!next) {
      throw new Error('Message not found.');
    }
    const message = await this.mapRowToMessage(next, userId);
    if (!message) {
      throw new Error('Message not available.');
    }
    return message;
  }

  async togglePinMessage(userId: string, chatId: string, messageId: string): Promise<AppChatMessage> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const role = await this.getMembershipRole(userId, chatId);
    if (!role) {
      throw new Error('Chat not accessible.');
    }

    const canPin = await this.canPinMessage(userId, chatId);
    if (!canPin) {
      throw new PermissionDeniedError('No permission to pin messages.');
    }

    const row = await this.loadMessageRow(chatId, messageId);
    if (!row) {
      throw new Error('Message not found.');
    }

    const meta = parseMessageMeta(row.attachments_json);
    if (meta.deletedForAll) {
      throw new Error('Message already deleted.');
    }
    if (meta.pinned) {
      meta.pinned = null;
    } else {
      meta.pinned = {
        by: userId,
        at: Date.now()
      };
    }

    await pool.query<ResultSetHeader>('UPDATE messages SET attachments_json = ? WHERE id = ? AND chat_id = ?', [
      JSON.stringify(meta),
      messageId,
      chatId
    ]);

    const next = await this.loadMessageRow(chatId, messageId);
    if (!next) {
      throw new Error('Message not found.');
    }
    const message = await this.mapRowToMessage(next, userId);
    if (!message) {
      throw new Error('Message not available.');
    }
    return message;
  }

  async listMessagesSince(chatId: string, sinceCreatedAt: number, viewerUserId: string): Promise<AppChatMessage[]> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const visibleAfter = await this.getChatMessageVisibleAfter(chatId);
    const minCreatedAt = Math.max(visibleAfter, Math.max(0, Math.floor(sinceCreatedAt)));

    const [rows] = await pool.query<MessageRow[]>(
      `
        SELECT
          m.id,
          m.chat_id,
          m.user_id,
          m.text,
          m.created_at,
          m.attachments_json,
          a.username,
          a.first_name,
          a.last_name,
          a.bio,
          a.email,
          a.global_role,
          a.avatar_updated_at
        FROM messages m
        JOIN auth_accounts a ON a.user_id = m.user_id
        WHERE m.chat_id = ?
          AND m.created_at > ?
        ORDER BY m.created_at ASC
        LIMIT 120
      `,
      [chatId, minCreatedAt]
    );

    return this.mapRowsToMessages(rows, viewerUserId);
  }

  async listBlacklistEntries(): Promise<BlacklistEntry[]> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const [rows] = await pool.query<BlacklistEntryRow[]>(
      `
        SELECT id, kind, value, value_norm, note, created_at, updated_at
        FROM app_blacklist_entries
        ORDER BY kind ASC, value ASC
      `
    );
    return rows.map(mapBlacklistEntry);
  }

  async addBlacklistEntry(kind: BlacklistKind, value: string, note?: string | null): Promise<BlacklistEntry> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const normalizedValue = normalizeBlacklistValue(kind, value);
    const displayValue = value.trim().replace(/\s+/g, ' ');
    if (!normalizedValue || !displayValue) {
      throw new Error('Blacklist-Wert ist leer.');
    }

    const now = Date.now();
    const id = randomUUID();

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO app_blacklist_entries (id, kind, value, value_norm, note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [id, kind, displayValue.slice(0, 190), normalizedValue.slice(0, 190), note?.trim().slice(0, 255) || null, now, now]
    );

    const [rows] = await pool.query<BlacklistEntryRow[]>(
      `
        SELECT id, kind, value, value_norm, note, created_at, updated_at
        FROM app_blacklist_entries
        WHERE id = ?
        LIMIT 1
      `,
      [id]
    );
    const entry = rows[0];
    if (!entry) {
      throw new Error('Blacklist-Eintrag konnte nicht geladen werden.');
    }
    return mapBlacklistEntry(entry);
  }

  async removeBlacklistEntry(id: string): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();
    await pool.query<ResultSetHeader>('DELETE FROM app_blacklist_entries WHERE id = ?', [id]);
  }

  async listIpBlacklistEntries(): Promise<IpBlacklistEntry[]> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const [rows] = await pool.query<IpBlacklistEntryRow[]>(
      `
        SELECT id, ip_norm, note, forbid_register, forbid_login, forbid_reset, forbid_chat, terminate_sessions, created_at, updated_at
        FROM app_ip_blacklist_entries
        ORDER BY updated_at DESC, ip_norm ASC
      `
    );
    return rows.map(mapIpBlacklistEntry);
  }

  async listIpAbuseFlags(limit = 200): Promise<IpAbuseFlag[]> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const [rows] = await pool.query<IpAbuseFlagRow[]>(
      `
        SELECT ip_norm, strikes, blocked_until, last_reason, created_at, updated_at
        FROM app_ip_abuse_flags
        ORDER BY strikes DESC, updated_at DESC
        LIMIT ?
      `,
      [safeLimit]
    );
    return rows.map(mapIpAbuseFlag);
  }

  async addIpBlacklistEntry(ip: string, scope: IpRestrictionScope, note?: string | null): Promise<IpBlacklistEntry> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const ipNorm = normalizeIp(ip);
    if (!ipNorm || ipNorm === 'unknown') {
      throw new Error('Ungültige IP-Adresse.');
    }
    if (!scope.forbidRegister && !scope.forbidLogin && !scope.forbidReset && !scope.forbidChat) {
      throw new Error('Mindestens eine Sperre muss aktiv sein.');
    }

    const now = Date.now();
    const id = randomUUID();
    await pool.query<ResultSetHeader>(
      `
        INSERT INTO app_ip_blacklist_entries (
          id, ip_norm, note, forbid_register, forbid_login, forbid_reset, forbid_chat, terminate_sessions, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          note = VALUES(note),
          forbid_register = VALUES(forbid_register),
          forbid_login = VALUES(forbid_login),
          forbid_reset = VALUES(forbid_reset),
          forbid_chat = VALUES(forbid_chat),
          terminate_sessions = VALUES(terminate_sessions),
          updated_at = VALUES(updated_at)
      `,
      [
        id,
        ipNorm,
        note?.trim().slice(0, 255) || null,
        scope.forbidRegister ? 1 : 0,
        scope.forbidLogin ? 1 : 0,
        scope.forbidReset ? 1 : 0,
        scope.forbidChat ? 1 : 0,
        scope.terminateSessions ? 1 : 0,
        now,
        now
      ]
    );

    if (scope.terminateSessions) {
      await this.terminateSessionsForIp(ipNorm);
    }

    const [rows] = await pool.query<IpBlacklistEntryRow[]>(
      `
        SELECT id, ip_norm, note, forbid_register, forbid_login, forbid_reset, forbid_chat, terminate_sessions, created_at, updated_at
        FROM app_ip_blacklist_entries
        WHERE ip_norm = ?
        LIMIT 1
      `,
      [ipNorm]
    );
    const entry = rows[0];
    if (!entry) {
      throw new Error('IP-Blacklist-Eintrag konnte nicht geladen werden.');
    }
    return mapIpBlacklistEntry(entry);
  }

  async removeIpBlacklistEntry(id: string): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();
    await pool.query<ResultSetHeader>('DELETE FROM app_ip_blacklist_entries WHERE id = ?', [id]);
  }

  async adminSetUserPassword(userId: string, newPassword: string, revokeSessions = true): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const account = await this.getAccountByUserId(userId);
    if (!account) {
      throw new Error('Account not found.');
    }

    const now = Date.now();
    await pool.query<ResultSetHeader>('UPDATE auth_accounts SET password_hash = ?, updated_at = ? WHERE user_id = ?', [
      hashPassword(newPassword),
      now,
      userId
    ]);

    if (revokeSessions) {
      await pool.query<ResultSetHeader>('DELETE FROM auth_sessions WHERE user_id = ?', [userId]);
    }
  }

  async setGlobalRole(actorUserId: string, targetUserId: string, role: GlobalRole): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const actor = await this.getAccountByUserId(actorUserId);
    if (!actor || actor.global_role !== 'superadmin') {
      throw new Error('Only superadmin can change global roles.');
    }

    if (actorUserId === targetUserId && role !== 'superadmin') {
      throw new Error('Superadmin cannot demote itself.');
    }

    await pool.query<ResultSetHeader>('UPDATE auth_accounts SET global_role = ?, updated_at = ? WHERE user_id = ?', [
      role,
      Date.now(),
      targetUserId
    ]);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __socialStore: SocialStore | undefined;
}

export const socialStore = globalThis.__socialStore ?? (globalThis.__socialStore = new SocialStore());
