export function getRedisClient(): never {
  throw new Error('Redis is no longer used. Configure MySQL via MYSQL_URL or MYSQL_* env vars.');
}
