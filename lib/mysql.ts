import mysql, { type Pool } from 'mysql2/promise';

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
    CREATE TABLE IF NOT EXISTS messages (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      user_name VARCHAR(64) NOT NULL,
      text TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      attachments_json LONGTEXT NULL,
      INDEX idx_messages_created_at (created_at),
      INDEX idx_messages_user_id (user_id),
      CONSTRAINT fk_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS uploads (
      id CHAR(36) PRIMARY KEY,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(255) NOT NULL,
      size BIGINT NOT NULL,
      uploaded_by CHAR(36) NOT NULL,
      uploaded_at BIGINT NOT NULL,
      buffer LONGBLOB NOT NULL,
      INDEX idx_uploads_uploaded_at (uploaded_at),
      INDEX idx_uploads_uploaded_by (uploaded_by),
      CONSTRAINT fk_uploads_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      rate_key VARCHAR(191) PRIMARY KEY,
      count INT NOT NULL,
      reset_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function ensureMysqlSchema(): Promise<void> {
  if (!globalThis.__mysqlInitPromise) {
    globalThis.__mysqlInitPromise = createSchema();
  }

  await globalThis.__mysqlInitPromise;
}
