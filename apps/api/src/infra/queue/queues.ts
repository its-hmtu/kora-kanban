export const QUEUE_NAMES = [
  'email',
  'notifications',
  'reminders',
  'outbox',
  'maintenance',
  'webhooks',
  'automation',
  'integrations',
  'data-transfer',
  'reports',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export interface RedisConnectionOptions {
  host: string;
  port: number;
  db: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
}

/**
 * BullMQ connection options derived from REDIS_URL, including the db index (the test harness gives
 * each worker its own db, so never assume db 0).
 */
export function redisConnectionFromUrl(url: string): RedisConnectionOptions {
  const u = new URL(url);
  const dbPart = u.pathname.replace(/^\//, '');
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    db: dbPart ? Number(dbPart) : 0,
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
