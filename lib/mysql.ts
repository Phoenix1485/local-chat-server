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
      deactivated_at BIGINT NULL,
      deactivated_by CHAR(36) NULL,
      INDEX idx_chats_is_global (is_global),
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
      left_at BIGINT NULL,
      PRIMARY KEY (chat_id, user_id),
      INDEX idx_memberships_user_id (user_id),
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
    CREATE TABLE IF NOT EXISTS rate_limits (
      rate_key VARCHAR(191) PRIMARY KEY,
      count INT NOT NULL,
      reset_at BIGINT NOT NULL,
      INDEX idx_rate_limits_reset_at (reset_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS chat_id CHAR(36) NULL AFTER id');
  await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS chat_name VARCHAR(80) NULL AFTER chat_id');
  await pool.query('ALTER TABLE messages ADD INDEX IF NOT EXISTS idx_messages_chat_id (chat_id)');
  await pool.query('ALTER TABLE messages ADD INDEX IF NOT EXISTS idx_messages_chat_created (chat_id, created_at)');

  await pool.query('ALTER TABLE uploads ADD COLUMN IF NOT EXISTS chat_id CHAR(36) NULL AFTER id');
  await pool.query('ALTER TABLE uploads ADD INDEX IF NOT EXISTS idx_uploads_chat_id (chat_id)');
  await pool.query('ALTER TABLE rate_limits ADD INDEX IF NOT EXISTS idx_rate_limits_reset_at (reset_at)');

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
}

export async function ensureMysqlSchema(): Promise<void> {
  if (!globalThis.__mysqlInitPromise) {
    globalThis.__mysqlInitPromise = createSchema();
  }

  await globalThis.__mysqlInitPromise;
}
