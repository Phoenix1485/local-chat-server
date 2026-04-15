import mysql, { type Pool, type ResultSetHeader } from 'mysql2/promise';
import { GLOBAL_CHAT_ID } from '@/lib/config';

type MysqlConfig = {
  uri?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
};

function readMysqlConfig(): MysqlConfig {
  const uri = process.env.MYSQL_URL?.trim();
  if (uri) {
    return { uri };
  }

  const host = process.env.MYSQL_HOST?.trim();
  const user = process.env.MYSQL_USER?.trim();
  const database = process.env.MYSQL_DATABASE?.trim();
  const password = process.env.MYSQL_PASSWORD ?? '';
  const portRaw = process.env.MYSQL_PORT?.trim();
  const parsedPort = Number.parseInt(portRaw ?? '', 10);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3306;

  if (!host || !user || !database) {
    throw new Error(
      'MySQL is not configured. Set MYSQL_URL or MYSQL_HOST/MYSQL_PORT/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE.'
    );
  }

  return {
    host,
    user,
    password,
    database,
    port
  };
}

function createPoolFromConfig(config: MysqlConfig): Pool {

  if (config.uri) {
    return mysql.createPool(config.uri);
  }

  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: 10,
    charset: 'utf8mb4'
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __mysqlPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __mysqlInitPromise: Promise<void> | undefined;
}

export function getMysqlPool(): Pool {
  if (globalThis.__mysqlPool) {
    return globalThis.__mysqlPool;
  }

  const config = readMysqlConfig();
  globalThis.__mysqlPool = createPoolFromConfig(config);
  return globalThis.__mysqlPool;
}

async function hasColumn(pool: Pool, tableName: string, columnName: string): Promise<boolean> {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
      LIMIT 1
    `,
    [tableName, columnName]
  );

  return Array.isArray(rows) && rows.length > 0;
}

async function hasIndex(pool: Pool, tableName: string, indexName: string): Promise<boolean> {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?
      LIMIT 1
    `,
    [tableName, indexName]
  );

  return Array.isArray(rows) && rows.length > 0;
}

async function createSchema(): Promise<void> {
  const pool = getMysqlPool();
  const now = Date.now();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id CHAR(36) PRIMARY KEY,
      name VARCHAR(64) NOT NULL,
      status ENUM('pending','approved','rejected') NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      ip VARCHAR(128) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chats (
      id CHAR(36) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      created_by CHAR(36) NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      is_global TINYINT(1) NOT NULL DEFAULT 0,
      chat_type ENUM('global','group','direct') NOT NULL DEFAULT 'group',
      group_invite_mode ENUM('direct','invite_link') NOT NULL DEFAULT 'direct',
      group_invite_policy ENUM('everyone','admins','owner') NOT NULL DEFAULT 'admins',
      group_everyone_mention_policy ENUM('everyone','admins','owner') NOT NULL DEFAULT 'admins',
      group_here_mention_policy ENUM('everyone','admins','owner') NOT NULL DEFAULT 'admins',
      group_invite_code VARCHAR(64) NULL,
      group_invite_code_updated_at BIGINT NULL,
      group_auto_hide_24h TINYINT(1) NOT NULL DEFAULT 0,
      group_message_cooldown_ms INT NOT NULL DEFAULT 1000,
      dm_key VARCHAR(80) NULL,
      deactivated_at BIGINT NULL,
      deactivated_by CHAR(36) NULL,
      INDEX idx_chats_is_global (is_global),
      INDEX idx_chats_chat_type (chat_type),
      UNIQUE KEY uq_chats_dm_key (dm_key),
      UNIQUE KEY uq_chats_group_invite_code (group_invite_code),
      INDEX idx_chats_deactivated_at (deactivated_at),
      CONSTRAINT fk_chats_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_chats_deactivated_by FOREIGN KEY (deactivated_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_memberships (
      chat_id CHAR(36) NOT NULL,
      user_id CHAR(36) NOT NULL,
      joined_at BIGINT NOT NULL,
      member_role ENUM('owner','admin','member') NOT NULL DEFAULT 'member',
      left_at BIGINT NULL,
      PRIMARY KEY (chat_id, user_id),
      INDEX idx_memberships_user_id (user_id),
      INDEX idx_memberships_role (member_role),
      INDEX idx_memberships_left_at (left_at),
      CONSTRAINT fk_memberships_chat FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
      CONSTRAINT fk_memberships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_presence (
      user_id CHAR(36) PRIMARY KEY,
      last_seen_at BIGINT NOT NULL,
      CONSTRAINT fk_presence_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id CHAR(36) PRIMARY KEY,
      chat_id CHAR(36) NOT NULL,
      chat_name VARCHAR(80) NOT NULL,
      user_id CHAR(36) NOT NULL,
      user_name VARCHAR(64) NOT NULL,
      text TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      attachments_json LONGTEXT NULL,
      INDEX idx_messages_created_at (created_at),
      INDEX idx_messages_chat_id (chat_id),
      INDEX idx_messages_chat_created (chat_id, created_at),
      INDEX idx_messages_user_id (user_id),
      CONSTRAINT fk_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_messages_chat FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS uploads (
      id CHAR(36) PRIMARY KEY,
      chat_id CHAR(36) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(255) NOT NULL,
      size BIGINT NOT NULL,
      uploaded_by CHAR(36) NOT NULL,
      uploaded_at BIGINT NOT NULL,
      buffer LONGBLOB NOT NULL,
      INDEX idx_uploads_uploaded_at (uploaded_at),
      INDEX idx_uploads_chat_id (chat_id),
      INDEX idx_uploads_uploaded_by (uploaded_by),
      CONSTRAINT fk_uploads_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_uploads_chat FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_reads (
      chat_id CHAR(36) NOT NULL,
      user_id CHAR(36) NOT NULL,
      last_read_at BIGINT NOT NULL,
      PRIMARY KEY (chat_id, user_id),
      INDEX idx_chat_reads_user (user_id),
      INDEX idx_chat_reads_last_read (last_read_at),
      CONSTRAINT fk_chat_reads_chat FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
      CONSTRAINT fk_chat_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_moderation_logs (
      id CHAR(36) PRIMARY KEY,
      chat_id CHAR(36) NOT NULL,
      action VARCHAR(64) NOT NULL,
      actor_user_id CHAR(36) NOT NULL,
      target_user_id CHAR(36) NULL,
      message_id CHAR(36) NULL,
      details_json LONGTEXT NULL,
      created_at BIGINT NOT NULL,
      INDEX idx_group_moderation_logs_chat_created (chat_id, created_at),
      INDEX idx_group_moderation_logs_actor (actor_user_id, created_at),
      INDEX idx_group_moderation_logs_target (target_user_id, created_at),
      CONSTRAINT fk_group_moderation_logs_chat FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
      CONSTRAINT fk_group_moderation_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_group_moderation_logs_target FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      rate_key VARCHAR(191) PRIMARY KEY,
      count INT NOT NULL,
      reset_at BIGINT NOT NULL,
      INDEX idx_rate_limits_reset_at (reset_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_accounts (
      user_id CHAR(36) PRIMARY KEY,
      username VARCHAR(24) NOT NULL,
      username_norm VARCHAR(24) NOT NULL,
      email VARCHAR(190) NULL,
      email_norm VARCHAR(190) NULL,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(64) NOT NULL,
      last_name VARCHAR(64) NOT NULL,
      bio VARCHAR(280) NOT NULL DEFAULT '',
      global_role ENUM('user','admin','superadmin') NOT NULL DEFAULT 'user',
      avatar_blob LONGBLOB NULL,
      avatar_mime VARCHAR(255) NULL,
      avatar_updated_at BIGINT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE KEY uq_auth_accounts_username_norm (username_norm),
      UNIQUE KEY uq_auth_accounts_email_norm (email_norm),
      INDEX idx_auth_accounts_global_role (global_role),
      CONSTRAINT fk_auth_accounts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      last_seen_at BIGINT NOT NULL,
      user_agent VARCHAR(255) NULL,
      UNIQUE KEY uq_auth_sessions_token_hash (token_hash),
      INDEX idx_auth_sessions_user_id (user_id),
      INDEX idx_auth_sessions_expires_at (expires_at),
      CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      used_at BIGINT NULL,
      UNIQUE KEY uq_password_reset_tokens_hash (token_hash),
      INDEX idx_password_reset_tokens_user_id (user_id),
      INDEX idx_password_reset_tokens_expires_at (expires_at),
      CONSTRAINT fk_password_reset_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id CHAR(36) PRIMARY KEY,
      sender_id CHAR(36) NOT NULL,
      receiver_id CHAR(36) NOT NULL,
      status ENUM('pending','accepted','declined','cancelled') NOT NULL DEFAULT 'pending',
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_friend_requests_sender (sender_id, status),
      INDEX idx_friend_requests_receiver (receiver_id, status),
      UNIQUE KEY uq_friend_request_pair_pending (sender_id, receiver_id, status),
      CONSTRAINT fk_friend_requests_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_friend_requests_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_blacklist_entries (
      id CHAR(36) PRIMARY KEY,
      kind ENUM('name','email') NOT NULL,
      value VARCHAR(190) NOT NULL,
      value_norm VARCHAR(190) NOT NULL,
      note VARCHAR(255) NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE KEY uq_app_blacklist_kind_value (kind, value_norm),
      INDEX idx_app_blacklist_kind (kind),
      INDEX idx_app_blacklist_updated (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_ip_blacklist_entries (
      id CHAR(36) PRIMARY KEY,
      ip_norm VARCHAR(128) NOT NULL,
      note VARCHAR(255) NULL,
      forbid_register TINYINT(1) NOT NULL DEFAULT 1,
      forbid_login TINYINT(1) NOT NULL DEFAULT 1,
      forbid_reset TINYINT(1) NOT NULL DEFAULT 1,
      forbid_chat TINYINT(1) NOT NULL DEFAULT 1,
      terminate_sessions TINYINT(1) NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      UNIQUE KEY uq_app_ip_blacklist_ip_norm (ip_norm),
      INDEX idx_app_ip_blacklist_updated (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_ip_abuse_flags (
      ip_norm VARCHAR(128) PRIMARY KEY,
      strikes INT NOT NULL DEFAULT 0,
      blocked_until BIGINT NULL,
      last_reason VARCHAR(120) NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_app_ip_abuse_flags_blocked (blocked_until),
      INDEX idx_app_ip_abuse_flags_updated (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_spam_blocks (
      user_id CHAR(36) NOT NULL,
      chat_id CHAR(36) NOT NULL,
      blocked_until BIGINT NOT NULL,
      strike_count INT NOT NULL DEFAULT 0,
      last_triggered_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, chat_id),
      INDEX idx_message_spam_blocks_until (blocked_until),
      INDEX idx_message_spam_blocks_chat (chat_id),
      CONSTRAINT fk_message_spam_blocks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_message_spam_blocks_chat FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS friendships (
      user_low CHAR(36) NOT NULL,
      user_high CHAR(36) NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (user_low, user_high),
      INDEX idx_friendships_user_high (user_high),
      CONSTRAINT fk_friendships_user_low FOREIGN KEY (user_low) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_friendships_user_high FOREIGN KEY (user_high) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  if (!(await hasColumn(pool, 'messages', 'chat_id'))) {
    await pool.query('ALTER TABLE messages ADD COLUMN chat_id CHAR(36) NULL AFTER id');
  }
  if (!(await hasColumn(pool, 'messages', 'chat_name'))) {
    await pool.query('ALTER TABLE messages ADD COLUMN chat_name VARCHAR(80) NULL AFTER chat_id');
  }
  if (!(await hasIndex(pool, 'messages', 'idx_messages_chat_id'))) {
    await pool.query('ALTER TABLE messages ADD INDEX idx_messages_chat_id (chat_id)');
  }
  if (!(await hasIndex(pool, 'messages', 'idx_messages_chat_created'))) {
    await pool.query('ALTER TABLE messages ADD INDEX idx_messages_chat_created (chat_id, created_at)');
  }

  if (!(await hasColumn(pool, 'uploads', 'chat_id'))) {
    await pool.query('ALTER TABLE uploads ADD COLUMN chat_id CHAR(36) NULL AFTER id');
  }
  if (!(await hasColumn(pool, 'chats', 'chat_type'))) {
    await pool.query("ALTER TABLE chats ADD COLUMN chat_type ENUM('global','group','direct') NOT NULL DEFAULT 'group' AFTER is_global");
  }
  if (!(await hasColumn(pool, 'chats', 'dm_key'))) {
    await pool.query('ALTER TABLE chats ADD COLUMN dm_key VARCHAR(80) NULL AFTER chat_type');
  }
  if (!(await hasColumn(pool, 'chats', 'group_invite_mode'))) {
    await pool.query("ALTER TABLE chats ADD COLUMN group_invite_mode ENUM('direct','invite_link') NOT NULL DEFAULT 'direct' AFTER chat_type");
  }
  if (!(await hasColumn(pool, 'chats', 'group_invite_policy'))) {
    await pool.query("ALTER TABLE chats ADD COLUMN group_invite_policy ENUM('everyone','admins','owner') NOT NULL DEFAULT 'admins' AFTER group_invite_mode");
  }
  if (!(await hasColumn(pool, 'chats', 'group_everyone_mention_policy'))) {
    await pool.query("ALTER TABLE chats ADD COLUMN group_everyone_mention_policy ENUM('everyone','admins','owner') NOT NULL DEFAULT 'admins' AFTER group_invite_policy");
  }
  if (!(await hasColumn(pool, 'chats', 'group_here_mention_policy'))) {
    await pool.query("ALTER TABLE chats ADD COLUMN group_here_mention_policy ENUM('everyone','admins','owner') NOT NULL DEFAULT 'admins' AFTER group_everyone_mention_policy");
  }
  if (!(await hasColumn(pool, 'chats', 'group_invite_code'))) {
    await pool.query('ALTER TABLE chats ADD COLUMN group_invite_code VARCHAR(64) NULL AFTER group_here_mention_policy');
  }
  if (!(await hasColumn(pool, 'chats', 'group_invite_code_updated_at'))) {
    await pool.query('ALTER TABLE chats ADD COLUMN group_invite_code_updated_at BIGINT NULL AFTER group_invite_code');
  }
  if (!(await hasColumn(pool, 'chats', 'group_auto_hide_24h'))) {
    await pool.query('ALTER TABLE chats ADD COLUMN group_auto_hide_24h TINYINT(1) NOT NULL DEFAULT 0 AFTER group_invite_code_updated_at');
  }
  if (!(await hasIndex(pool, 'chats', 'idx_chats_chat_type'))) {
    await pool.query('ALTER TABLE chats ADD INDEX idx_chats_chat_type (chat_type)');
  }
  if (!(await hasIndex(pool, 'chats', 'uq_chats_dm_key'))) {
    await pool.query('ALTER TABLE chats ADD UNIQUE INDEX uq_chats_dm_key (dm_key)');
  }
  if (!(await hasIndex(pool, 'chats', 'uq_chats_group_invite_code'))) {
    await pool.query('ALTER TABLE chats ADD UNIQUE INDEX uq_chats_group_invite_code (group_invite_code)');
  }

  if (!(await hasColumn(pool, 'chat_memberships', 'member_role'))) {
    await pool.query(
      "ALTER TABLE chat_memberships ADD COLUMN member_role ENUM('owner','admin','member') NOT NULL DEFAULT 'member' AFTER joined_at"
    );
  }
  if (!(await hasIndex(pool, 'chat_memberships', 'idx_memberships_role'))) {
    await pool.query('ALTER TABLE chat_memberships ADD INDEX idx_memberships_role (member_role)');
  }

  if (!(await hasIndex(pool, 'uploads', 'idx_uploads_chat_id'))) {
    await pool.query('ALTER TABLE uploads ADD INDEX idx_uploads_chat_id (chat_id)');
  }
  if (!(await hasIndex(pool, 'rate_limits', 'idx_rate_limits_reset_at'))) {
    await pool.query('ALTER TABLE rate_limits ADD INDEX idx_rate_limits_reset_at (reset_at)');
  }

  await pool.query<ResultSetHeader>(
    `
      INSERT INTO chats (id, name, created_by, created_at, updated_at, is_global, deactivated_at, deactivated_by)
      VALUES (?, 'Global', NULL, ?, ?, 1, NULL, NULL)
      ON DUPLICATE KEY UPDATE id = VALUES(id), is_global = 1, deactivated_at = NULL, deactivated_by = NULL
    `,
    [GLOBAL_CHAT_ID, now, now]
  );

  await pool.query<ResultSetHeader>(
    `
      UPDATE chats
      SET
        chat_type = CASE
          WHEN is_global = 1 THEN 'global'
          WHEN dm_key IS NOT NULL AND dm_key <> '' THEN 'direct'
          ELSE 'group'
        END
    `
  );

  await pool.query<ResultSetHeader>(
    `
      UPDATE chat_memberships cm
      JOIN chats c ON c.id = cm.chat_id
      SET cm.member_role = CASE
        WHEN c.created_by IS NOT NULL AND c.created_by = cm.user_id THEN 'owner'
        WHEN c.is_global = 1 THEN 'member'
        ELSE cm.member_role
      END
    `
  );

  await pool.query<ResultSetHeader>(
    `
      UPDATE messages
      SET chat_id = ?, chat_name = COALESCE(NULLIF(chat_name, ''), 'Global')
      WHERE chat_id IS NULL OR chat_id = ''
    `,
    [GLOBAL_CHAT_ID]
  );

  await pool.query<ResultSetHeader>(
    `
      UPDATE uploads
      SET chat_id = ?
      WHERE chat_id IS NULL OR chat_id = ''
    `,
    [GLOBAL_CHAT_ID]
  );

  await pool.query<ResultSetHeader>(
    `
      INSERT INTO chat_memberships (chat_id, user_id, joined_at, left_at)
      SELECT ?, u.id, ?, NULL
      FROM users u
      WHERE u.status = 'approved'
      ON DUPLICATE KEY UPDATE left_at = NULL
    `,
    [GLOBAL_CHAT_ID, now]
  );

  if (!(await hasColumn(pool, 'chats', 'group_message_cooldown_ms'))) {
    await pool.query(`
      ALTER TABLE chats
      ADD COLUMN group_message_cooldown_ms INT NOT NULL DEFAULT 1000
    `);
  }
}

export async function ensureMysqlSchema(): Promise<void> {
  if (!globalThis.__mysqlInitPromise) {
    globalThis.__mysqlInitPromise = createSchema().catch((error) => {
      globalThis.__mysqlInitPromise = undefined;
      throw error;
    });
  }

  await globalThis.__mysqlInitPromise;
}
