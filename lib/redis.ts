type RedisPrimitive = string | number;

type RedisSetOptions = {
  ex?: number;
};

type RedisRestResult<T> = {
  result: T;
  error?: string;
};

class RedisRestClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  private async exec<T>(command: string, args: RedisPrimitive[] = []): Promise<T> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([command, ...args])
    });

    const rawBody = await response.text();
    let payload: RedisRestResult<T> | null = null;

    if (rawBody) {
      try {
        payload = JSON.parse(rawBody) as RedisRestResult<T>;
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const detail = payload?.error ?? (rawBody || `${response.status} ${response.statusText}`);
      throw new Error(`Redis command failed: ${command} (${detail})`);
    }

    if (!payload) {
      throw new Error(`Redis command failed: ${command} (empty or invalid JSON response)`);
    }

    if (payload.error) {
      throw new Error(`Redis command failed: ${command} (${payload.error})`);
    }

    return payload.result;
  }

  async hset(key: string, fields: Record<string, string>): Promise<number> {
    const args: RedisPrimitive[] = [key];
    for (const [field, value] of Object.entries(fields)) {
      args.push(field, value);
    }
    return this.exec<number>('HSET', args);
  }

  async hget<T = string>(key: string, field: string): Promise<T | null> {
    return this.exec<T | null>('HGET', [key, field]);
  }

  async hgetall<T>(key: string): Promise<T | null> {
    return this.exec<T | null>('HGETALL', [key]);
  }

  async hdel(key: string, field: string): Promise<number> {
    return this.exec<number>('HDEL', [key, field]);
  }

  async rpush(key: string, value: string): Promise<number> {
    return this.exec<number>('RPUSH', [key, value]);
  }

  async ltrim(key: string, start: number, stop: number): Promise<'OK'> {
    return this.exec<'OK'>('LTRIM', [key, start, stop]);
  }

  async lrange<T = string[]>(key: string, start: number, stop: number): Promise<T> {
    return this.exec<T>('LRANGE', [key, start, stop]);
  }

  async set(key: string, value: string, options?: RedisSetOptions): Promise<'OK'> {
    const args: RedisPrimitive[] = [key, value];
    if (typeof options?.ex === 'number') {
      args.push('EX', Math.max(1, Math.floor(options.ex)));
    }
    return this.exec<'OK'>('SET', args);
  }

  async get<T = string>(key: string): Promise<T | null> {
    return this.exec<T | null>('GET', [key]);
  }

  async del(key: string): Promise<number> {
    return this.exec<number>('DEL', [key]);
  }

  async exists(key: string): Promise<number> {
    return this.exec<number>('EXISTS', [key]);
  }

  async incr(key: string): Promise<number> {
    return this.exec<number>('INCR', [key]);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.exec<number>('EXPIRE', [key, Math.max(1, Math.floor(seconds))]);
  }

  async ttl(key: string): Promise<number> {
    return this.exec<number>('TTL', [key]);
  }
}

function readRedisConfig(): { url: string; token: string } {
  const url = process.env.REDIS_REST_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.REDIS_REST_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Redis is not configured. Set REDIS_REST_URL and REDIS_REST_TOKEN.'
    );
  }

  return {
    url,
    token
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __redisRestClient: RedisRestClient | undefined;
}

export function getRedisClient(): RedisRestClient {
  if (globalThis.__redisRestClient) {
    return globalThis.__redisRestClient;
  }

  const config = readRedisConfig();
  globalThis.__redisRestClient = new RedisRestClient(config.url, config.token);
  return globalThis.__redisRestClient;
}
