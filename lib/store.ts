import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { CHAT_LIMITS } from '@/lib/config';
import { ensureMysqlSchema, getMysqlPool } from '@/lib/mysql';
import type { AdminSnapshot, ChatAttachment, ChatMessage, StoredUpload, UserSession, UserStatus } from '@/types/chat';

type UserRow = RowDataPacket & {
  id: string;
  name: string;
  status: UserStatus;
  created_at: number;
  updated_at: number;
  ip: string;
};

type MessageRow = RowDataPacket & {
  id: string;
  user_id: string;
  user_name: string;
  text: string;
  created_at: number;
  attachments_json: string | null;
};

type UploadRow = RowDataPacket & {
  id: string;
  file_name: string;
  mime_type: string;
  size: number;
  uploaded_by: string;
  uploaded_at: number;
  buffer: Buffer;
};

type UploadMetaRow = RowDataPacket & {
  id: string;
  file_name: string;
  mime_type: string;
  size: number;
  uploaded_by: string;
  uploaded_at: number;
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

function mapMessage(row: MessageRow): ChatMessage {
  const attachments = parseJson<ChatAttachment[]>(row.attachments_json);

  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    text: row.text,
    createdAt: asNumber(row.created_at),
    attachments: Array.isArray(attachments) && attachments.length > 0 ? attachments : undefined
  };
}

class ChatStore {
  private async ensureReady(): Promise<void> {
    await ensureMysqlSchema();
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

  async addMessage(userId: string, text: string, attachments?: ChatAttachment[]): Promise<ChatMessage | null> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const user = await this.getUser(userId);
    if (!user || user.status !== 'approved') {
      return null;
    }

    const message: ChatMessage = {
      id: randomUUID(),
      userId,
      userName: user.name,
      text,
      createdAt: Date.now(),
      attachments: attachments && attachments.length > 0 ? attachments : undefined
    };

    await pool.query<ResultSetHeader>(
      'INSERT INTO messages (id, user_id, user_name, text, created_at, attachments_json) VALUES (?, ?, ?, ?, ?, ?)',
      [
        message.id,
        message.userId,
        message.userName,
        message.text,
        message.createdAt,
        message.attachments ? JSON.stringify(message.attachments) : null
      ]
    );

    await this.enforceMessageLimit();

    return message;
  }

  async getRecentMessages(limit = 80): Promise<ChatMessage[]> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const safeLimit = Math.max(1, Math.floor(limit));

    const [rows] = await pool.query<MessageRow[]>(
      `
      SELECT id, user_id, user_name, text, created_at, attachments_json
      FROM (
        SELECT id, user_id, user_name, text, created_at, attachments_json
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

  async storeUpload(userId: string, input: { fileName: string; mimeType: string; size: number; buffer: Buffer }): Promise<StoredUpload> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const user = await this.getUser(userId);
    if (!user || user.status !== 'approved') {
      throw new Error('User is not approved.');
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
      fileName: input.fileName,
      mimeType: input.mimeType,
      size: input.size,
      buffer: input.buffer,
      uploadedAt: now,
      uploadedBy: userId
    };

    await pool.query<ResultSetHeader>(
      'INSERT INTO uploads (id, file_name, mime_type, size, uploaded_by, uploaded_at, buffer) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [stored.id, stored.fileName, stored.mimeType, stored.size, stored.uploadedBy, stored.uploadedAt, stored.buffer]
    );

    await this.enforceUploadCountLimit();

    return stored;
  }

  async getUpload(fileId: string): Promise<StoredUpload | null> {
    await this.ensureReady();
    const pool = getMysqlPool();

    const [rows] = await pool.query<UploadRow[]>(
      'SELECT id, file_name, mime_type, size, uploaded_by, uploaded_at, buffer FROM uploads WHERE id = ? LIMIT 1',
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
      fileName: row.file_name,
      mimeType: row.mime_type,
      size: asNumber(row.size),
      uploadedBy: row.uploaded_by,
      uploadedAt: asNumber(row.uploaded_at),
      buffer: Buffer.isBuffer(row.buffer) ? row.buffer : Buffer.from(row.buffer as unknown as Uint8Array)
    };
  }

  async getAdminSnapshot(): Promise<AdminSnapshot> {
    const [users, recentMessages] = await Promise.all([
      this.listUsers(),
      this.getRecentMessages(60)
    ]);

    const pending = users.filter((user) => user.status === 'pending');
    const approved = users.filter((user) => user.status === 'approved');
    const rejected = users.filter((user) => user.status === 'rejected');

    return {
      users,
      pending,
      approved,
      rejected,
      recentMessages
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
      'SELECT id, file_name, mime_type, size, uploaded_by, uploaded_at FROM uploads ORDER BY uploaded_at ASC LIMIT ?',
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
