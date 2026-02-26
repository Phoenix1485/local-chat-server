import { randomUUID } from 'node:crypto';
import { CHAT_LIMITS } from '@/lib/config';
import { getRedisClient } from '@/lib/redis';
import type { AdminSnapshot, ChatAttachment, ChatMessage, StoredUpload, UserSession, UserStatus } from '@/types/chat';

const KEYS = {
  users: 'chat:users',
  messages: 'chat:messages',
  uploadsMeta: 'chat:uploads:meta'
} as const;

type UploadMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: number;
};

type UploadRecord = UploadMeta & {
  bufferBase64: string;
};

function uploadKey(fileId: string): string {
  return `chat:upload:${fileId}`;
}

function parseJson<T>(value: unknown): T | null {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  if (typeof value === 'object') {
    return value as T;
  }

  return null;
}

function parseHashValues(hash: unknown): unknown[] {
  if (!hash || typeof hash !== 'object') {
    return [];
  }

  if (Array.isArray(hash)) {
    if (hash.length === 0) {
      return [];
    }

    // Some Redis REST providers return HGETALL as [[field, value], ...]
    if (Array.isArray(hash[0])) {
      return hash
        .map((entry) => (Array.isArray(entry) && entry.length >= 2 ? entry[1] : null))
        .filter((value): value is unknown => value !== null);
    }

    // Some providers return [{ field, value }, ...] or [{ key, value }, ...]
    if (
      typeof hash[0] === 'object' &&
      hash[0] !== null &&
      ('value' in (hash[0] as Record<string, unknown>) || 'Value' in (hash[0] as Record<string, unknown>))
    ) {
      const values = hash
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const record = entry as Record<string, unknown>;
          if ('value' in record) {
            return record.value ?? null;
          }

          if ('Value' in record) {
            return record.Value ?? null;
          }

          return null;
        })
        .filter((value) => value !== null);

      return values as unknown[];
    }

    // Upstash REST default format: [field, value, field, value, ...]
    const values: unknown[] = [];
    for (let i = 0; i < hash.length; i += 2) {
      const maybeValue = hash[i + 1];
      if (maybeValue !== undefined) {
        values.push(maybeValue);
      }
    }
    return values;
  }

  return Object.values(hash as Record<string, unknown>);
}

class ChatStore {
  private async readHashValues(key: string): Promise<unknown[]> {
    const redis = getRedisClient();

    // Read all hash fields explicitly to ensure we always get complete values from Redis.
    try {
      const fields = await redis.hkeys<unknown>(key);
      if (Array.isArray(fields) && fields.length > 0) {
        const rawValues = await Promise.all(
          fields
            .filter((field): field is string => typeof field === 'string' && field.length > 0)
            .map((field) => redis.hget<unknown>(key, field))
        );

        return rawValues.filter((value): value is unknown => value != null);
      }
    } catch {
      // Fall back to command variants below.
    }

    // Prefer HVALS to avoid provider-specific HGETALL result layouts.
    try {
      const rawValues = await redis.hvals<unknown[]>(key);
      if (Array.isArray(rawValues)) {
        return rawValues;
      }
    } catch {
      // Fall back to HGETALL parsing below.
    }

    const rawHash = await redis.hgetall<unknown>(key);
    return parseHashValues(rawHash);
  }

  async listUsers(): Promise<UserSession[]> {
    const values = await this.readHashValues(KEYS.users);
    return values
      .map((raw) => parseJson<UserSession>(raw))
      .filter((user): user is UserSession => !!user)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async createUser(name: string, ip: string): Promise<UserSession> {
    const now = Date.now();
    const user: UserSession = {
      id: randomUUID(),
      name,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      ip
    };

    const redis = getRedisClient();
    await redis.hset(KEYS.users, { [user.id]: JSON.stringify(user) });

    return user;
  }

  async getUser(userId: string): Promise<UserSession | null> {
    const redis = getRedisClient();
    const raw = await redis.hget<string>(KEYS.users, userId);
    return parseJson<UserSession>(raw);
  }

  async setUserStatus(userId: string, status: UserStatus): Promise<UserSession | null> {
    const user = await this.getUser(userId);
    if (!user) {
      return null;
    }

    user.status = status;
    user.updatedAt = Date.now();

    const redis = getRedisClient();
    await redis.hset(KEYS.users, { [user.id]: JSON.stringify(user) });

    return user;
  }

  async listUsersByStatus(status: UserStatus): Promise<UserSession[]> {
    const values = await this.readHashValues(KEYS.users);
    return values
      .map((raw) => parseJson<UserSession>(raw))
      .filter((user): user is UserSession => !!user && user.status === status)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async addMessage(userId: string, text: string, attachments?: ChatAttachment[]): Promise<ChatMessage | null> {
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

    const redis = getRedisClient();
    await redis.rpush(KEYS.messages, JSON.stringify(message));
    await redis.ltrim(KEYS.messages, -CHAT_LIMITS.maxMessagesInMemory, -1);

    return message;
  }

  async getRecentMessages(limit = 80): Promise<ChatMessage[]> {
    const redis = getRedisClient();
    const rawMessages = await redis.lrange<string[]>(KEYS.messages, -limit, -1);

    if (!Array.isArray(rawMessages)) {
      return [];
    }

    return rawMessages
      .map((raw) => parseJson<ChatMessage>(raw))
      .filter((message): message is ChatMessage => !!message)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async storeUpload(userId: string, input: { fileName: string; mimeType: string; size: number; buffer: Buffer }): Promise<StoredUpload> {
    const user = await this.getUser(userId);
    if (!user || user.status !== 'approved') {
      throw new Error('User is not approved.');
    }

    const now = Date.now();
    await this.cleanupUploads(now);

    const metas = await this.getUploadMetas();
    const totalBytes = metas.reduce((sum, meta) => sum + meta.size, 0);
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

    const record: UploadRecord = {
      id: stored.id,
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      size: stored.size,
      uploadedBy: stored.uploadedBy,
      uploadedAt: stored.uploadedAt,
      bufferBase64: stored.buffer.toString('base64')
    };

    const redis = getRedisClient();
    await redis.set(uploadKey(stored.id), JSON.stringify(record), {
      ex: Math.ceil(CHAT_LIMITS.uploadTtlMs / 1000)
    });
    await redis.hset(KEYS.uploadsMeta, {
      [stored.id]: JSON.stringify({
        id: stored.id,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        size: stored.size,
        uploadedBy: stored.uploadedBy,
        uploadedAt: stored.uploadedAt
      } satisfies UploadMeta)
    });

    await this.enforceUploadCountLimit();

    return stored;
  }

  async getUpload(fileId: string): Promise<StoredUpload | null> {
    const redis = getRedisClient();
    const raw = await redis.get<string>(uploadKey(fileId));

    if (typeof raw !== 'string') {
      await redis.hdel(KEYS.uploadsMeta, fileId);
      return null;
    }

    const record = parseJson<UploadRecord>(raw);
    if (!record) {
      await redis.del(uploadKey(fileId));
      await redis.hdel(KEYS.uploadsMeta, fileId);
      return null;
    }

    return {
      id: record.id,
      fileName: record.fileName,
      mimeType: record.mimeType,
      size: record.size,
      uploadedBy: record.uploadedBy,
      uploadedAt: record.uploadedAt,
      buffer: Buffer.from(record.bufferBase64, 'base64')
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

  private async getUploadMetas(): Promise<UploadMeta[]> {
    const values = await this.readHashValues(KEYS.uploadsMeta);
    return values
      .map((raw) => parseJson<UploadMeta>(raw))
      .filter((meta): meta is UploadMeta => !!meta)
      .sort((a, b) => a.uploadedAt - b.uploadedAt);
  }

  private async cleanupUploads(now = Date.now()): Promise<void> {
    const redis = getRedisClient();
    const metas = await this.getUploadMetas();

    for (const meta of metas) {
      const isExpiredByTime = now - meta.uploadedAt > CHAT_LIMITS.uploadTtlMs;
      const exists = await redis.exists(uploadKey(meta.id));

      if (isExpiredByTime || exists === 0) {
        await redis.del(uploadKey(meta.id));
        await redis.hdel(KEYS.uploadsMeta, meta.id);
      }
    }
  }

  private async enforceUploadCountLimit(): Promise<void> {
    const redis = getRedisClient();
    const metas = await this.getUploadMetas();

    if (metas.length <= CHAT_LIMITS.maxUploadsInMemory) {
      return;
    }

    const toDelete = metas.slice(0, metas.length - CHAT_LIMITS.maxUploadsInMemory);

    for (const meta of toDelete) {
      await redis.del(uploadKey(meta.id));
      await redis.hdel(KEYS.uploadsMeta, meta.id);
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __chatStore: ChatStore | undefined;
}

export const chatStore = globalThis.__chatStore ?? (globalThis.__chatStore = new ChatStore());
