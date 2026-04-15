import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { CHAT_LIMITS, GLOBAL_CHAT_ID } from '@/lib/config';
import { ensureMysqlSchema, getMysqlPool } from '@/lib/mysql';
import type {
  AdminChatSummary,
  AdminSnapshot,
  ChatAttachment,
  ChatContext,
  ChatMember,
  ChatMessage,
  ChatRoom,
  ChatRoomSummary,
  InviteCandidate,
  StoredUpload,
  UserSession,
  UserStatus
} from '@/types/chat';

type UserRow = RowDataPacket & {
  id: string;
  name: string;
  status: UserStatus;
  created_at: number;
  updated_at: number;
  ip: string;
};

type ChatRow = RowDataPacket & {
  id: string;
  name: string;
  created_by: string | null;
  created_at: number;
  updated_at: number;
  is_global: number;
  deactivated_at: number | null;
  deactivated_by: string | null;
};

type ChatSummaryRow = ChatRow & {
  members_count: number;
  last_message_at: number | null;
};

type AdminChatRow = ChatSummaryRow & {
  created_by_name: string | null;
  deactivated_by_name: string | null;
};

type MemberRow = RowDataPacket & {
  id: string;
  name: string;
  status: UserStatus;
  joined_at: number;
  last_seen_at: number | null;
};

type InviteCandidateRow = RowDataPacket & {
  id: string;
  name: string;
  status: UserStatus;
  last_seen_at: number | null;
};

type MessageRow = RowDataPacket & {
  id: string;
  chat_id: string;
  chat_name: string;
  user_id: string;
  user_name: string;
  text: string;
  created_at: number;
  attachments_json: string | null;
};

type UploadRow = RowDataPacket & {
  id: string;
  chat_id: string | null;
  file_name: string;
  mime_type: string;
  size: number;
  uploaded_by: string;
  uploaded_at: number;
  buffer: Buffer;
};

type UploadMetaRow = RowDataPacket & {
  id: string;
};

type CountRow = RowDataPacket & {
  total: number;
};

type IdRow = RowDataPacket & {
  id: string;
};

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
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

  const parsed = asNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueIds(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function mapUser(row: UserRow): UserSession {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at),
    ip: row.ip
  };
}

function mapChat(row: ChatRow): ChatRoom {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at),
    isGlobal: asNumber(row.is_global) === 1,
    deactivatedAt: asNullableNumber(row.deactivated_at),
    deactivatedBy: row.deactivated_by
  };
}

function mapMessage(row: MessageRow): ChatMessage {
  const attachments = parseJson<ChatAttachment[]>(row.attachments_json);

  return {
    id: row.id,
    chatId: row.chat_id,
    chatName: row.chat_name,
    userId: row.user_id,
    userName: row.user_name,
    text: row.text,
    createdAt: asNumber(row.created_at),
    attachments: Array.isArray(attachments) && attachments.length > 0 ? attachments : undefined
  };
}

class ChatStore {
  private lastDeactivatedCleanupAt = 0;

  private async ensureReady(): Promise<void> {
    await ensureMysqlSchema();
  }

  getGlobalChatId(): string {
    return GLOBAL_CHAT_ID;
  }

  private isOnlineLastSeen(lastSeenAt: number | null, now = Date.now()): boolean {
    if (!lastSeenAt) {
      return false;
    }

    return now - lastSeenAt <= CHAT_LIMITS.userOnlineTtlMs;
  }

  private async cleanupDeactivatedChats(now = Date.now(), force = false): Promise<void> {
    if (!force && now - this.lastDeactivatedCleanupAt < 5 * 60_000) {
      return;
    }

    this.lastDeactivatedCleanupAt = now;
    await this.ensureReady();
    const pool = getMysqlPool();
    const minDeactivatedAt = now - CHAT_LIMITS.deactivatedChatRetentionMs;

    await pool.query<ResultSetHeader>(
      'DELETE FROM chats WHERE is_global = 0 AND deactivated_at IS NOT NULL AND deactivated_at < ?',
      [minDeactivatedAt]
    );
  }

  async touchUserPresence(userId: string): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO user_presence (user_id, last_seen_at)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE last_seen_at = VALUES(last_seen_at)
      `,
      [userId, now]
    );
  }

  async listUsers(): Promise<UserSession[]> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<UserRow[]>(
      'SELECT id, name, status, created_at, updated_at, ip FROM users ORDER BY created_at ASC'
    );

    return rows.map(mapUser);
  }

  async createUser(name: string, ip: string): Promise<UserSession> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const now = Date.now();
    const user: UserSession = {
      id: randomUUID(),
      name,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      ip
    };

    await pool.query<ResultSetHeader>(
      'INSERT INTO users (id, name, status, created_at, updated_at, ip) VALUES (?, ?, ?, ?, ?, ?)',
      [user.id, user.name, user.status, user.createdAt, user.updatedAt, user.ip]
    );

    return user;
  }

  async getUser(userId: string): Promise<UserSession | null> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<UserRow[]>(
      'SELECT id, name, status, created_at, updated_at, ip FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    const row = rows[0];
    return row ? mapUser(row) : null;
  }

  private async ensureApprovedUserHasGlobalMembership(userId: string, now = Date.now()): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO chat_memberships (chat_id, user_id, joined_at, left_at)
        VALUES (?, ?, ?, NULL)
        ON DUPLICATE KEY UPDATE left_at = NULL
      `,
      [GLOBAL_CHAT_ID, userId, now]
    );
  }

  async setUserStatus(userId: string, status: UserStatus, currentUser?: UserSession): Promise<UserSession | null> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const user = currentUser ?? (await this.getUser(userId));
    if (!user) {
      return null;
    }

    const updatedAt = Date.now();

    await pool.query<ResultSetHeader>(
      'UPDATE users SET status = ?, updated_at = ? WHERE id = ?',
      [status, updatedAt, userId]
    );

    if (status === 'approved') {
      await this.ensureApprovedUserHasGlobalMembership(userId, updatedAt);
      await this.touchUserPresence(userId);
    }

    return {
      ...user,
      status,
      updatedAt
    };
  }

  async listUsersByStatus(status: UserStatus): Promise<UserSession[]> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<UserRow[]>(
      'SELECT id, name, status, created_at, updated_at, ip FROM users WHERE status = ? ORDER BY created_at ASC',
      [status]
    );

    return rows.map(mapUser);
  }

  async deleteUsers(userIds?: string[]): Promise<number> {
    await this.ensureReady();
    const pool = getMysqlPool();

    if (Array.isArray(userIds) && userIds.length > 0) {
      const ids = uniqueIds(userIds);
      if (ids.length === 0) {
        return 0;
      }

      const placeholders = ids.map(() => '?').join(',');
      const [result] = await pool.query<ResultSetHeader>(
        `DELETE FROM users WHERE id IN (${placeholders})`,
        ids
      );
      return result.affectedRows ?? 0;
    }

    const [result] = await pool.query<ResultSetHeader>('DELETE FROM users');
    return result.affectedRows ?? 0;
  }

  async getChat(chatId: string, options?: { includeDeactivated?: boolean }): Promise<ChatRoom | null> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const includeDeactivated = Boolean(options?.includeDeactivated);

    const [rows] = await pool.query<ChatRow[]>(
      `
        SELECT id, name, created_by, created_at, updated_at, is_global, deactivated_at, deactivated_by
        FROM chats
        WHERE id = ?
          ${includeDeactivated ? '' : 'AND deactivated_at IS NULL'}
        LIMIT 1
      `,
      [chatId]
    );

    const row = rows[0];
    return row ? mapChat(row) : null;
  }

  private mapChatSummary(row: ChatSummaryRow, userId: string): ChatRoomSummary {
    const isGlobal = asNumber(row.is_global) === 1;

    return {
      id: row.id,
      name: row.name,
      createdBy: row.created_by,
      createdAt: asNumber(row.created_at),
      updatedAt: asNumber(row.updated_at),
      isGlobal,
      membersCount: asNumber(row.members_count),
      lastMessageAt: asNullableNumber(row.last_message_at),
      canLeave: !isGlobal,
      canDelete: !isGlobal && row.created_by === userId
    };
  }

  private async listUserChats(userId: string): Promise<ChatRoomSummary[]> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<ChatSummaryRow[]>(
      `
        SELECT
          c.id,
          c.name,
          c.created_by,
          c.created_at,
          c.updated_at,
          c.is_global,
          c.deactivated_at,
          c.deactivated_by,
          COUNT(cm_all.user_id) AS members_count,
          MAX(m.created_at) AS last_message_at
        FROM chats c
        JOIN chat_memberships cm_user
          ON cm_user.chat_id = c.id
         AND cm_user.user_id = ?
         AND cm_user.left_at IS NULL
        LEFT JOIN chat_memberships cm_all
          ON cm_all.chat_id = c.id
         AND cm_all.left_at IS NULL
        LEFT JOIN messages m
          ON m.chat_id = c.id
        WHERE c.deactivated_at IS NULL
        GROUP BY
          c.id,
          c.name,
          c.created_by,
          c.created_at,
          c.updated_at,
          c.is_global,
          c.deactivated_at,
          c.deactivated_by
        ORDER BY c.is_global DESC, COALESCE(MAX(m.created_at), c.updated_at) DESC, c.name ASC
      `,
      [userId]
    );

    return rows.map((row) => this.mapChatSummary(row, userId));
  }

  private async getChatMembers(chatId: string): Promise<ChatMember[]> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();

    const [rows] = await pool.query<MemberRow[]>(
      `
        SELECT
          u.id,
          u.name,
          u.status,
          cm.joined_at,
          up.last_seen_at
        FROM chat_memberships cm
        JOIN users u ON u.id = cm.user_id
        LEFT JOIN user_presence up ON up.user_id = u.id
        WHERE cm.chat_id = ?
          AND cm.left_at IS NULL
        ORDER BY u.name ASC
      `,
      [chatId]
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      joinedAt: asNumber(row.joined_at),
      isOnline: row.status === 'approved' && this.isOnlineLastSeen(asNullableNumber(row.last_seen_at), now)
    }));
  }

  private async getInviteCandidates(chatId: string): Promise<InviteCandidate[]> {
    await this.ensureReady();
    const pool = getMysqlPool();
    const now = Date.now();
    const minLastSeenAt = now - CHAT_LIMITS.userOnlineTtlMs;

    const [rows] = await pool.query<InviteCandidateRow[]>(
      `
        SELECT
          u.id,
          u.name,
          u.status,
          up.last_seen_at
        FROM users u
        JOIN user_presence up ON up.user_id = u.id
        WHERE u.status = 'approved'
          AND up.last_seen_at >= ?
          AND NOT EXISTS (
            SELECT 1
            FROM chat_memberships cm
            WHERE cm.chat_id = ?
              AND cm.user_id = u.id
              AND cm.left_at IS NULL
          )
        ORDER BY u.name ASC
      `,
      [minLastSeenAt, chatId]
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      isOnline: this.isOnlineLastSeen(asNullableNumber(row.last_seen_at), now)
    }));
  }

  async getChatContext(userId: string, requestedChatId?: string): Promise<ChatContext | null> {
    await this.ensureReady();
    await this.cleanupDeactivatedChats();

    const user = await this.getUser(userId);
    if (!user || user.status !== 'approved') {
      return null;
    }

    await this.ensureApprovedUserHasGlobalMembership(userId);
    await this.touchUserPresence(userId);

    const chats = await this.listUserChats(userId);
    if (chats.length === 0) {
      return null;
    }

    const requested = requestedChatId?.trim() ?? '';
    const activeChat = chats.find((chat) => chat.id === requested) ?? chats[0];
    const members = await this.getChatMembers(activeChat.id);
    const inviteCandidates = activeChat.isGlobal ? [] : await this.getInviteCandidates(activeChat.id);

    return {
      globalChatId: GLOBAL_CHAT_ID,
      chats,
      activeChat,
      members,
      inviteCandidates
    };
  }

  async getAccessibleChatForUser(userId: string, chatId: string): Promise<ChatRoom | null> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<ChatRow[]>(
      `
        SELECT
          c.id,
          c.name,
          c.created_by,
          c.created_at,
          c.updated_at,
          c.is_global,
          c.deactivated_at,
          c.deactivated_by
        FROM chats c
        JOIN chat_memberships cm
          ON cm.chat_id = c.id
         AND cm.user_id = ?
         AND cm.left_at IS NULL
        WHERE c.id = ?
          AND c.deactivated_at IS NULL
        LIMIT 1
      `,
      [userId, chatId]
    );

    const row = rows[0];
    return row ? mapChat(row) : null;
  }

  async createChat(userId: string, roomName: string, initialInviteIds: string[] = []): Promise<ChatRoom | null> {
    await this.ensureReady();
    await this.cleanupDeactivatedChats();

    const user = await this.getUser(userId);
    if (!user || user.status !== 'approved') {
      return null;
    }

    const pool = getMysqlPool();
    const now = Date.now();
    const chatId = randomUUID();

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO chats (id, name, created_by, created_at, updated_at, is_global, deactivated_at, deactivated_by)
        VALUES (?, ?, ?, ?, ?, 0, NULL, NULL)
      `,
      [chatId, roomName, userId, now, now]
    );

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO chat_memberships (chat_id, user_id, joined_at, left_at)
        VALUES (?, ?, ?, NULL)
        ON DUPLICATE KEY UPDATE left_at = NULL
      `,
      [chatId, userId, now]
    );

    const inviteIds = uniqueIds(initialInviteIds).filter((candidateId) => candidateId !== userId);
    if (inviteIds.length > 0) {
      const placeholders = inviteIds.map(() => '?').join(',');
      const cutoff = now - CHAT_LIMITS.userOnlineTtlMs;

      const [eligibleRows] = await pool.query<IdRow[]>(
        `
          SELECT u.id
          FROM users u
          JOIN user_presence up ON up.user_id = u.id
          WHERE u.id IN (${placeholders})
            AND u.status = 'approved'
            AND up.last_seen_at >= ?
        `,
        [...inviteIds, cutoff]
      );

      for (const row of eligibleRows) {
        await pool.query<ResultSetHeader>(
          `
            INSERT INTO chat_memberships (chat_id, user_id, joined_at, left_at)
            VALUES (?, ?, ?, NULL)
            ON DUPLICATE KEY UPDATE left_at = NULL
          `,
          [chatId, row.id, now]
        );
      }
    }

    return this.getChat(chatId);
  }

  async inviteToChat(chatId: string, inviterId: string, targetUserId: string): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const inviter = await this.getUser(inviterId);
    if (!inviter || inviter.status !== 'approved') {
      throw new Error('Inviter is not approved.');
    }

    const target = await this.getUser(targetUserId);
    if (!target || target.status !== 'approved') {
      throw new Error('Target user must be approved.');
    }

    const chat = await this.getChat(chatId);
    if (!chat) {
      throw new Error('Chat not found.');
    }

    if (chat.isGlobal) {
      throw new Error('Global chat does not require invites.');
    }

    const inviterMembership = await this.getAccessibleChatForUser(inviterId, chatId);
    if (!inviterMembership) {
      throw new Error('Inviter is not a member of this chat.');
    }

    const now = Date.now();
    const cutoff = now - CHAT_LIMITS.userOnlineTtlMs;

    const [presenceRows] = await pool.query<RowDataPacket[]>(
      'SELECT last_seen_at FROM user_presence WHERE user_id = ? LIMIT 1',
      [targetUserId]
    );

    const presence = presenceRows[0];
    const lastSeenAt = presence ? asNullableNumber(presence.last_seen_at) : null;
    if (!lastSeenAt || lastSeenAt < cutoff) {
      throw new Error('Target user is not online.');
    }

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO chat_memberships (chat_id, user_id, joined_at, left_at)
        VALUES (?, ?, ?, NULL)
        ON DUPLICATE KEY UPDATE left_at = NULL
      `,
      [chatId, targetUserId, now]
    );

    await pool.query<ResultSetHeader>('UPDATE chats SET updated_at = ? WHERE id = ?', [now, chatId]);
  }

  async leaveChat(chatId: string, userId: string): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const chat = await this.getChat(chatId);
    if (!chat) {
      throw new Error('Chat not found.');
    }

    if (chat.isGlobal) {
      throw new Error('Global chat cannot be left.');
    }

    const [membershipRows] = await pool.query<RowDataPacket[]>(
      `
        SELECT 1
        FROM chat_memberships
        WHERE chat_id = ? AND user_id = ? AND left_at IS NULL
        LIMIT 1
      `,
      [chatId, userId]
    );

    if (membershipRows.length === 0) {
      throw new Error('You are not a member of this chat.');
    }

    const now = Date.now();
    await pool.query<ResultSetHeader>(
      'UPDATE chat_memberships SET left_at = ? WHERE chat_id = ? AND user_id = ? AND left_at IS NULL',
      [now, chatId, userId]
    );
    await pool.query<ResultSetHeader>('UPDATE chats SET updated_at = ? WHERE id = ?', [now, chatId]);
  }

  async deactivateChat(chatId: string, userId: string): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const chat = await this.getChat(chatId);
    if (!chat) {
      throw new Error('Chat not found.');
    }

    if (chat.isGlobal) {
      throw new Error('Global chat cannot be deactivated.');
    }

    if (chat.createdBy !== userId) {
      throw new Error('Only the chat creator can deactivate this chat.');
    }

    const now = Date.now();
    await pool.query<ResultSetHeader>(
      'UPDATE chats SET deactivated_at = ?, deactivated_by = ?, updated_at = ? WHERE id = ? AND deactivated_at IS NULL',
      [now, userId, now, chatId]
    );
  }

  async reactivateChat(chatId: string): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const chat = await this.getChat(chatId, { includeDeactivated: true });
    if (!chat) {
      throw new Error('Chat not found.');
    }

    if (chat.isGlobal) {
      throw new Error('Global chat cannot be reactivated.');
    }

    if (!chat.deactivatedAt) {
      throw new Error('Chat is already active.');
    }

    const now = Date.now();
    await pool.query<ResultSetHeader>(
      'UPDATE chats SET deactivated_at = NULL, deactivated_by = NULL, updated_at = ? WHERE id = ?',
      [now, chatId]
    );
  }

  async addMessage(userId: string, chatId: string, text: string, attachments?: ChatAttachment[]): Promise<ChatMessage | null> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const user = await this.getUser(userId);
    if (!user || user.status !== 'approved') {
      return null;
    }

    const chat = await this.getAccessibleChatForUser(userId, chatId);
    if (!chat || chat.deactivatedAt) {
      return null;
    }

    const message: ChatMessage = {
      id: randomUUID(),
      chatId: chat.id,
      chatName: chat.name,
      userId,
      userName: user.name,
      text,
      createdAt: Date.now(),
      attachments: attachments && attachments.length > 0 ? attachments : undefined
    };

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO messages (id, chat_id, chat_name, user_id, user_name, text, created_at, attachments_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        message.id,
        message.chatId,
        message.chatName,
        message.userId,
        message.userName,
        message.text,
        message.createdAt,
        message.attachments ? JSON.stringify(message.attachments) : null
      ]
    );

    await pool.query<ResultSetHeader>('UPDATE chats SET updated_at = ? WHERE id = ?', [message.createdAt, chat.id]);
    await this.enforceMessageLimit();

    return message;
  }

  async getRecentMessages(chatId: string, limit = 80): Promise<ChatMessage[]> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const safeLimit = Math.max(1, Math.floor(limit));

    const [rows] = await pool.query<MessageRow[]>(
      `
        SELECT id, chat_id, chat_name, user_id, user_name, text, created_at, attachments_json
        FROM (
          SELECT id, chat_id, chat_name, user_id, user_name, text, created_at, attachments_json
          FROM messages
          WHERE chat_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        ) recent
        ORDER BY created_at ASC
      `,
      [chatId, safeLimit]
    );

    return rows.map(mapMessage);
  }

  async getMessagesSince(chatId: string, sinceCreatedAt: number, limit = 120): Promise<ChatMessage[]> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const safeLimit = Math.max(1, Math.floor(limit));
    const since = Number.isFinite(sinceCreatedAt) ? Math.max(0, Math.floor(sinceCreatedAt)) : 0;

    const [rows] = await pool.query<MessageRow[]>(
      `
        SELECT id, chat_id, chat_name, user_id, user_name, text, created_at, attachments_json
        FROM messages
        WHERE chat_id = ?
          AND created_at > ?
        ORDER BY created_at ASC
        LIMIT ?
      `,
      [chatId, since, safeLimit]
    );

    return rows.map(mapMessage);
  }

  async getRecentMessagesAcrossChats(limit = 80): Promise<ChatMessage[]> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const safeLimit = Math.max(1, Math.floor(limit));

    const [rows] = await pool.query<MessageRow[]>(
      `
        SELECT id, chat_id, chat_name, user_id, user_name, text, created_at, attachments_json
        FROM (
          SELECT id, chat_id, chat_name, user_id, user_name, text, created_at, attachments_json
          FROM messages
          ORDER BY created_at DESC
          LIMIT ?
        ) recent
        ORDER BY created_at ASC
      `,
      [safeLimit]
    );

    return rows.map(mapMessage);
  }

  async storeUpload(
    userId: string,
    chatId: string,
    input: { fileName: string; mimeType: string; size: number; buffer: Buffer }
  ): Promise<StoredUpload> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const user = await this.getUser(userId);
    if (!user || user.status !== 'approved') {
      throw new Error('User is not approved.');
    }

    const chat = await this.getAccessibleChatForUser(userId, chatId);
    if (!chat || chat.deactivatedAt) {
      throw new Error('Chat not accessible.');
    }

    const now = Date.now();
    await this.cleanupUploads(now);

    const [sumRows] = await pool.query<CountRow[]>('SELECT COALESCE(SUM(size), 0) AS total FROM uploads');
    const totalBytes = asNumber(sumRows[0]?.total, 0);

    if (totalBytes + input.size > CHAT_LIMITS.uploadMaxTotalBytes) {
      throw new Error('Upload memory limit reached.');
    }

    const stored: StoredUpload = {
      id: randomUUID(),
      chatId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.size,
      buffer: input.buffer,
      uploadedAt: now,
      uploadedBy: userId
    };

    await pool.query<ResultSetHeader>(
      `
        INSERT INTO uploads (id, chat_id, file_name, mime_type, size, uploaded_by, uploaded_at, buffer)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [stored.id, stored.chatId, stored.fileName, stored.mimeType, stored.size, stored.uploadedBy, stored.uploadedAt, stored.buffer]
    );

    await this.enforceUploadCountLimit();

    return stored;
  }

  async getUpload(fileId: string): Promise<StoredUpload | null> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<UploadRow[]>(
      'SELECT id, chat_id, file_name, mime_type, size, uploaded_by, uploaded_at, buffer FROM uploads WHERE id = ? LIMIT 1',
      [fileId]
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    if (Date.now() - asNumber(row.uploaded_at) > CHAT_LIMITS.uploadTtlMs) {
      await pool.query<ResultSetHeader>('DELETE FROM uploads WHERE id = ?', [fileId]);
      return null;
    }

    return {
      id: row.id,
      chatId: row.chat_id || GLOBAL_CHAT_ID,
      fileName: row.file_name,
      mimeType: row.mime_type,
      size: asNumber(row.size),
      uploadedBy: row.uploaded_by,
      uploadedAt: asNumber(row.uploaded_at),
      buffer: Buffer.isBuffer(row.buffer) ? row.buffer : Buffer.from(row.buffer as unknown as Uint8Array)
    };
  }

  private mapAdminChat(row: AdminChatRow): AdminChatSummary {
    return {
      id: row.id,
      name: row.name,
      isGlobal: asNumber(row.is_global) === 1,
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      createdAt: asNumber(row.created_at),
      updatedAt: asNumber(row.updated_at),
      deactivatedAt: asNullableNumber(row.deactivated_at),
      deactivatedBy: row.deactivated_by,
      deactivatedByName: row.deactivated_by_name,
      membersCount: asNumber(row.members_count)
    };
  }

  private async getAdminChats(): Promise<{ active: AdminChatSummary[]; deactivated: AdminChatSummary[] }> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<AdminChatRow[]>(
      `
        SELECT
          c.id,
          c.name,
          c.created_by,
          c.created_at,
          c.updated_at,
          c.is_global,
          c.deactivated_at,
          c.deactivated_by,
          creator.name AS created_by_name,
          deactivator.name AS deactivated_by_name,
          COUNT(cm.user_id) AS members_count,
          MAX(m.created_at) AS last_message_at
        FROM chats c
        LEFT JOIN users creator ON creator.id = c.created_by
        LEFT JOIN users deactivator ON deactivator.id = c.deactivated_by
        LEFT JOIN chat_memberships cm ON cm.chat_id = c.id AND cm.left_at IS NULL
        LEFT JOIN messages m ON m.chat_id = c.id
        GROUP BY
          c.id,
          c.name,
          c.created_by,
          c.created_at,
          c.updated_at,
          c.is_global,
          c.deactivated_at,
          c.deactivated_by,
          creator.name,
          deactivator.name
        ORDER BY c.is_global DESC, c.deactivated_at IS NULL DESC, COALESCE(MAX(m.created_at), c.updated_at) DESC
      `
    );

    const mapped = rows.map((row) => this.mapAdminChat(row));
    return {
      active: mapped.filter((chat) => chat.deactivatedAt === null),
      deactivated: mapped.filter((chat) => chat.deactivatedAt !== null)
    };
  }

  async getAdminSnapshot(): Promise<AdminSnapshot> {
    await this.cleanupDeactivatedChats();

    const [users, recentMessages, chats] = await Promise.all([
      this.listUsers(),
      this.getRecentMessagesAcrossChats(60),
      this.getAdminChats()
    ]);

    const pending = users.filter((user) => user.status === 'pending');
    const approved = users.filter((user) => user.status === 'approved');
    const rejected = users.filter((user) => user.status === 'rejected');

    return {
      users,
      pending,
      approved,
      rejected,
      recentMessages,
      activeChats: chats.active,
      deactivatedChats: chats.deactivated,
      blacklist: [],
      ipBlacklist: [],
      ipAbuseFlags: []
    };
  }

  private async enforceMessageLimit(): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [countRows] = await pool.query<CountRow[]>('SELECT COUNT(*) AS total FROM messages');
    const total = asNumber(countRows[0]?.total, 0);
    if (total <= CHAT_LIMITS.maxMessagesInMemory) {
      return;
    }

    const overflow = total - CHAT_LIMITS.maxMessagesInMemory;
    const [rows] = await pool.query<IdRow[]>('SELECT id FROM messages ORDER BY created_at ASC LIMIT ?', [overflow]);
    const ids = rows
      .map((row: IdRow) => row.id)
      .filter((id: string): id is string => typeof id === 'string' && id.length > 0);

    if (ids.length === 0) {
      return;
    }

    const placeholders = ids.map(() => '?').join(',');
    await pool.query<ResultSetHeader>(`DELETE FROM messages WHERE id IN (${placeholders})`, ids);
  }

  private async cleanupUploads(now = Date.now()): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const minUploadedAt = now - CHAT_LIMITS.uploadTtlMs;
    await pool.query<ResultSetHeader>('DELETE FROM uploads WHERE uploaded_at < ?', [minUploadedAt]);
  }

  private async enforceUploadCountLimit(): Promise<void> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [countRows] = await pool.query<CountRow[]>('SELECT COUNT(*) AS total FROM uploads');
    const total = asNumber(countRows[0]?.total, 0);

    if (total <= CHAT_LIMITS.maxUploadsInMemory) {
      return;
    }

    const overflow = total - CHAT_LIMITS.maxUploadsInMemory;
    const [rows] = await pool.query<UploadMetaRow[]>(
      'SELECT id FROM uploads ORDER BY uploaded_at ASC LIMIT ?',
      [overflow]
    );

    const ids = rows
      .map((row: UploadMetaRow) => row.id)
      .filter((id: string) => typeof id === 'string' && id.length > 0);

    if (ids.length === 0) {
      return;
    }

    const placeholders = ids.map(() => '?').join(',');
    await pool.query<ResultSetHeader>(`DELETE FROM uploads WHERE id IN (${placeholders})`, ids);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __chatStore: ChatStore | undefined;
}

export const chatStore = globalThis.__chatStore ?? (globalThis.__chatStore = new ChatStore());
