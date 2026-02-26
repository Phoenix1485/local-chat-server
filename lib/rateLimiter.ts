import { createHash } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { ensureMysqlSchema, getMysqlPool } from '@/lib/mysql';

type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetInMs: number;
};

type RateLimitRow = RowDataPacket & {
  count: number;
  reset_at: number;
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

class MysqlRateLimiter {
  private checksSinceCleanup = 0;

  private normalizeRateKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  private async maybeCleanupExpired(now: number): Promise<void> {
    this.checksSinceCleanup += 1;

    if (this.checksSinceCleanup < 120) {
      return;
    }

    this.checksSinceCleanup = 0;
    const pool = getMysqlPool();
    await pool.query<ResultSetHeader>('DELETE FROM rate_limits WHERE reset_at < ? LIMIT 1000', [now]);
  }

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    await ensureMysqlSchema();
    const pool = getMysqlPool();
    const now = Date.now();
    const resetAt = now + windowMs;
    const normalizedKey = this.normalizeRateKey(key);

    await this.maybeCleanupExpired(now);

    const [rows] = await pool.query<RateLimitRow[]>(
      'SELECT count, reset_at FROM rate_limits WHERE rate_key = ? LIMIT 1',
      [normalizedKey]
    );

    const existing = rows[0];
    let count = 1;
    let activeResetAt = resetAt;

    if (!existing) {
      await pool.query<ResultSetHeader>(
        'INSERT INTO rate_limits (rate_key, count, reset_at) VALUES (?, ?, ?)',
        [normalizedKey, count, activeResetAt]
      );
    } else if (asNumber(existing.reset_at) <= now) {
      await pool.query<ResultSetHeader>(
        'UPDATE rate_limits SET count = ?, reset_at = ? WHERE rate_key = ?',
        [count, activeResetAt, normalizedKey]
      );
    } else {
      activeResetAt = asNumber(existing.reset_at, resetAt);
      count = asNumber(existing.count, 0) + 1;
      await pool.query<ResultSetHeader>(
        'UPDATE rate_limits SET count = ? WHERE rate_key = ?',
        [count, normalizedKey]
      );
    }

    const resetInMs = Math.max(1, activeResetAt - now);

    if (count > limit) {
      return {
        ok: false,
        remaining: 0,
        resetInMs
      };
    }

    return {
      ok: true,
      remaining: Math.max(0, limit - count),
      resetInMs
    };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __mysqlRateLimiter: MysqlRateLimiter | undefined;
}

export const rateLimiter = globalThis.__mysqlRateLimiter ?? (globalThis.__mysqlRateLimiter = new MysqlRateLimiter());
