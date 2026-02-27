import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { APP_LIMITS, CHAT_LIMITS, GLOBAL_CHAT_ID } from '@/lib/config';
import { ensureMysqlSchema, getMysqlPool } from '@/lib/mysql';
import { createSessionToken, hashPassword, hashToken, normalizeEmail, normalizeUsername, verifyPassword } from '@/lib/security';
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
  AppUserProfile,
  FriendRequestItem,
  GlobalRole,
  GroupInviteMode,
  GroupInvitePolicy,
  GroupMentionPolicy,
  GroupMemberRole
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
};

type ChatMemberRow = RowDataPacket & {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  bio: string;
  email: string | null;
  global_role: GlobalRole;
  avatar_updated_at: number | null;
  joined_at: number;
  member_role: GroupMemberRole;
  is_online: number;
};

type ChatMemberProfileRow = RowDataPacket & {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  bio: string;
  email: string | null;
  global_role: GlobalRole;
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
  avatar_updated_at: number | null;
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
    avatar_updated_at: number | null;
  },
  options?: { includeEmail?: boolean; isFriend?: boolean }
): AppUserProfile {
  const first = row.first_name ?? '';
  const last = row.last_name ?? '';
  const fullName = `${first} ${last}`.trim() || row.username;

  return {
    id: row.user_id,
    username: row.username,
    firstName: first,
    lastName: last,
    fullName,
    bio: row.bio ?? '',
    email: options?.includeEmail ? row.email : null,
    avatarUpdatedAt: asNullableNumber(row.avatar_updated_at),
    role: row.global_role,
    isFriend: options?.isFriend
  };
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
    mentionedMe: !deletedForAll && (meta.mentionUserIds ?? []).includes(viewerUserId),
    readBy: deletedForAll ? [] : readBy
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

    const row = rows[0] ?? null;
    if (!row || row.user_status !== 'approved') {
      return null;
    }

    return row;
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
          a.avatar_updated_at
        FROM chat_memberships cm
        JOIN auth_accounts a ON a.user_id = cm.user_id
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
    const receiptsByMessageId = await this.getChatReadReceiptsByMessageId(rows[0].chat_id, rows);
    return rows
      .map((row) => buildMessage(row, viewerUserId, receiptsByMessageId.get(row.id) ?? []))
      .filter((item): item is AppChatMessage => Boolean(item));
  }

  private async mapRowToMessage(row: MessageRow, viewerUserId: string): Promise<AppChatMessage | null> {
    const receiptsByMessageId = await this.getChatReadReceiptsByMessageId(row.chat_id, [row]);
    return buildMessage(row, viewerUserId, receiptsByMessageId.get(row.id) ?? []);
  }

  async setTyping(userId: string, chatId: string, isTyping: boolean): Promise<void> {
    const role = await this.getMembershipRole(userId, chatId);
    if (!role) {
      throw new Error('Chat not accessible.');
    }

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
    const canManageMembers = row.chat_type === 'group' && (role === 'owner' || role === 'admin');
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
  }): Promise<{ token: string; session: UserSessionContext }> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    const username = input.username.trim();
    const usernameNorm = normalizeUsername(username);
    const email = input.email?.trim() ? input.email.trim() : null;
    const emailNorm = email ? normalizeEmail(email) : null;

    const [existingRows] = await pool.query<RowDataPacket[]>(
      'SELECT 1 FROM auth_accounts WHERE username_norm = ? OR (email_norm IS NOT NULL AND email_norm = ?) LIMIT 1',
      [usernameNorm, emailNorm]
    );
    if (existingRows.length > 0) {
      throw new Error('Username or email already exists.');
    }

    const [countRows] = await pool.query<CountRow[]>('SELECT COUNT(*) AS total FROM auth_accounts');
    const totalAccounts = asNumber(countRows[0]?.total, 0);
    const role: GlobalRole = totalAccounts === 0 ? 'superadmin' : 'user';

    const userId = randomUUID();
    const passwordHash = hashPassword(input.password);
    const displayName = `${input.firstName.trim()} ${input.lastName.trim()}`.trim() || username;

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO users (id, name, status, created_at, updated_at, ip)
        VALUES (?, ?, 'approved', ?, ?, ?)
      `,
      [userId, displayName.slice(0, 64), now, now, input.ip.slice(0, 128)]
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

    await this.ensureGlobalMembership(userId, now);

    return this.createSession(userId, input.userAgent);
  }

  async loginAccount(input: {
    identifier: string;
    password: string;
    userAgent: string;
  }): Promise<{ token: string; session: UserSessionContext } | null> {
    const account = await this.getAccountByIdentifier(input.identifier);
    if (!account) {
      return null;
    }

    const isValid = verifyPassword(input.password, account.password_hash);
    if (!isValid) {
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

  async requestPasswordReset(identifier: string): Promise<string | null> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const account = await this.getAccountByIdentifier(identifier);
    if (!account) {
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

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
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
      return false;
    }

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

    const [chats, friends, requests] = await Promise.all([
      this.listChats(userId),
      this.listFriends(userId),
      this.listFriendRequests(userId)
    ]);

    const activeChatId = chats.find((chat) => chat.id === requestedChatId)?.id ?? chats[0]?.id ?? null;

    return {
      me: mapProfile(meAccount, { includeEmail: true }),
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

    return mapProfile(row, { isFriend: asNumber(row.is_friend) === 1, includeEmail: viewerId === targetId });
  }

  async updateMyProfile(
    userId: string,
    input: { firstName: string; lastName: string; bio: string; email: string | null }
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
        SET first_name = ?, last_name = ?, bio = ?, email = ?, email_norm = ?, updated_at = ?
        WHERE user_id = ?
      `,
      [firstName, lastName, bio, email, emailNorm, now, userId]
    );

    await pool.query<ResultSetHeader>('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [
      displayName.slice(0, 64),
      now,
      userId
    ]);

    const account = await this.getAccountByUserId(userId);
    if (!account) {
      throw new Error('Profile not found.');
    }

    return mapProfile(account, { includeEmail: true });
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

    const role = rows[0]?.member_role;
    if (role === 'owner' || role === 'admin' || role === 'member') {
      return role;
    }
    return null;
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
          group_auto_hide_24h
        FROM chats
        WHERE id = ?
        LIMIT 1
      `,
      [chatId]
    );

    return rows[0] ?? null;
  }

  private canManageGroupUsers(role: GroupMemberRole): boolean {
    return role === 'owner' || role === 'admin';
  }

  private canManageGroupSettings(role: GroupMemberRole): boolean {
    return role === 'owner';
  }

  private canInviteDirectly(role: GroupMemberRole, policy: GroupInvitePolicy): boolean {
    if (policy === 'everyone') {
      return role === 'owner' || role === 'admin' || role === 'member';
    }
    if (policy === 'owner') {
      return role === 'owner';
    }
    return role === 'owner' || role === 'admin';
  }

  private canUseMentionByPolicy(role: GroupMemberRole, policy: GroupMentionPolicy): boolean {
    if (policy === 'everyone') {
      return role === 'owner' || role === 'admin' || role === 'member';
    }
    if (policy === 'owner') {
      return role === 'owner';
    }
    return role === 'owner' || role === 'admin';
  }

  private buildGroupSettings(chat: GroupChatControlRow, role: GroupMemberRole): AppGroupSettings {
    const inviteMode = toGroupInviteMode(chat.group_invite_mode);
    const invitePolicy = toGroupInvitePolicy(chat.group_invite_policy);
    const everyoneMentionPolicy = toGroupMentionPolicy(chat.group_everyone_mention_policy);
    const hereMentionPolicy = toGroupMentionPolicy(chat.group_here_mention_policy);
    const canManageUsers = this.canManageGroupUsers(role);
    const canManageSettings = this.canManageGroupSettings(role);

    return {
      inviteMode,
      invitePolicy,
      inviteCode: canManageSettings ? (chat.group_invite_code?.trim() || null) : null,
      inviteLink: canManageSettings && chat.group_invite_code
        ? `/chat?inviteCode=${encodeURIComponent(chat.group_invite_code)}`
        : null,
      autoHideAfter24h: asNumber(chat.group_auto_hide_24h) === 1,
      canInviteDirectly: canManageUsers && inviteMode === 'direct' && this.canInviteDirectly(role, invitePolicy),
      canManageUsers,
      canManageSettings,
      canTransferOwnership: role === 'owner',
      canCloseGroup: role === 'owner',
      everyoneMentionPolicy,
      hereMentionPolicy,
      canUseEveryoneMention: this.canUseMentionByPolicy(role, everyoneMentionPolicy),
      canUseHereMention: this.canUseMentionByPolicy(role, hereMentionPolicy)
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
    action: 'invite' | 'promote' | 'demote' | 'kick' | 'transfer_ownership'
  ): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();

    const chat = await this.getGroupChatControl(chatId);
    if (!chat?.id || chat.chat_type !== 'group' || asNullableNumber(chat.deactivated_at)) {
      throw new Error('Only group chats can be managed.');
    }

    const actorRole = await this.getMembershipRole(userId, chatId);
    if (!actorRole) {
      throw new Error('Chat not accessible.');
    }

    if (action === 'invite') {
      const inviteMode = toGroupInviteMode(chat.group_invite_mode);
      const invitePolicy = toGroupInvitePolicy(chat.group_invite_policy);
      if (inviteMode === 'invite_link') {
        throw new Error('Direktes Hinzufuegen ist deaktiviert. Nutze den Invite-Link.');
      }
      if (!this.canInviteDirectly(actorRole, invitePolicy)) {
        throw new Error('Insufficient group permissions.');
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

      await pool.query<ResultSetHeader>(
        `
          INSERT INTO chat_memberships (chat_id, user_id, joined_at, member_role, left_at)
          VALUES (?, ?, ?, 'member', NULL)
          ON DUPLICATE KEY UPDATE left_at = NULL
        `,
        [chatId, targetUserId, now]
      );
      await pool.query<ResultSetHeader>('UPDATE chats SET updated_at = ? WHERE id = ?', [now, chatId]);
      return;
    }

    if (!this.canManageGroupUsers(actorRole) && action !== 'transfer_ownership') {
      throw new Error('Insufficient group permissions.');
    }

    const targetRole = await this.getMembershipRole(targetUserId, chatId);
    if (!targetRole) {
      throw new Error('Target user is not part of this group.');
    }

    if (targetUserId === userId && action !== 'transfer_ownership') {
      throw new Error('You cannot perform this action on yourself.');
    }

    if (targetRole === 'owner' && action !== 'transfer_ownership') {
      throw new Error('Group owner cannot be modified.');
    }

    if (action === 'promote') {
      if (actorRole !== 'owner') {
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
      return;
    }

    if (action === 'demote') {
      if (actorRole !== 'owner') {
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
      return;
    }

    if (action === 'kick') {
      if (actorRole === 'admin' && targetRole !== 'member') {
        throw new Error('Admins can only kick members.');
      }
      await pool.query<ResultSetHeader>(
        'UPDATE chat_memberships SET left_at = ? WHERE chat_id = ? AND user_id = ? AND left_at IS NULL',
        [now, chatId, targetUserId]
      );
      await pool.query<ResultSetHeader>('UPDATE chats SET updated_at = ? WHERE id = ?', [now, chatId]);
      return;
    }

    if (action === 'transfer_ownership') {
      if (actorRole !== 'owner') {
        throw new Error('Only group owner can transfer ownership.');
      }
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
    }
  ): Promise<AppGroupSettings> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    const chat = await this.getGroupChatControl(chatId);
    if (!chat?.id || chat.chat_type !== 'group' || asNullableNumber(chat.deactivated_at)) {
      throw new Error('Only active group chats can be configured.');
    }

    const role = await this.getMembershipRole(userId, chatId);
    if (role !== 'owner') {
      throw new Error('Only group owner can change settings.');
    }

    const inviteMode = toGroupInviteMode(input.inviteMode);
    const invitePolicy = toGroupInvitePolicy(input.invitePolicy);
    const everyoneMentionPolicy = toGroupMentionPolicy(input.everyoneMentionPolicy);
    const hereMentionPolicy = toGroupMentionPolicy(input.hereMentionPolicy);
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
        inviteCode,
        inviteCode,
        now,
        now,
        chatId
      ]
    );

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
    const chat = await this.getGroupChatControl(chatId);
    if (!chat?.id || chat.chat_type !== 'group' || asNullableNumber(chat.deactivated_at)) {
      throw new Error('Only active group chats can be configured.');
    }

    const role = await this.getMembershipRole(userId, chatId);
    if (role !== 'owner') {
      throw new Error('Only group owner can regenerate invite links.');
    }

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
    const chat = await this.getGroupChatControl(chatId);
    if (!chat?.id || chat.chat_type !== 'group' || asNullableNumber(chat.deactivated_at)) {
      throw new Error('Only active group chats can be closed.');
    }

    const role = await this.getMembershipRole(userId, chatId);
    if (role !== 'owner') {
      throw new Error('Only group owner can close the group.');
    }

    await pool.query<ResultSetHeader>(
      'UPDATE chats SET deactivated_at = ?, deactivated_by = ?, updated_at = ? WHERE id = ?',
      [now, userId, now, chatId]
    );
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
          a.username ASC
      `,
      [now, now - CHAT_LIMITS.userOnlineTtlMs, chatId]
    );

    const members: AppChatMember[] = memberRows.map((row) => ({
      user: mapProfile(row, { includeEmail: row.user_id === userId }),
      joinedAt: asNumber(row.joined_at),
      role: row.member_role,
      isOnline: asNumber(row.is_online) === 1
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
    if (chatType === 'group' && shouldPingEveryone && !this.canUseMentionByPolicy(senderRole, everyonePolicy)) {
      throw new Error('You are not allowed to use @everyone in this group.');
    }
    if (chatType === 'group' && shouldPingHere && !this.canUseMentionByPolicy(senderRole, herePolicy)) {
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

  async addMessage(userId: string, chatId: string, input: AddMessageInput): Promise<AppChatMessage> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    const role = await this.getMembershipRole(userId, chatId);
    if (!role) {
      throw new Error('Chat not accessible.');
    }

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
          group_here_mention_policy
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
    const mentionUserIds = await this.resolveMentionUserIds(
      chatId,
      chatType,
      userId,
      role,
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
    const actor = await this.getAccountByUserId(actorUserId);
    if (actor?.global_role === 'superadmin') {
      return true;
    }
    const role = await this.getMembershipRole(actorUserId, chatId);
    return role === 'owner';
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
        throw new Error('No permission to delete for all.');
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
