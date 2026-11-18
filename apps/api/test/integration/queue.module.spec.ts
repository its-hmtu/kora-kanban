import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConfigModule } from '../../src/infra/config/config.module';
import { QueueModule } from '../../src/infra/queue/queue.module';
import { QUEUE_NAMES, redisConnectionFromUrl } from '../../src/infra/queue/queues';
import { closeHarness, getPrisma, getRedis, resetDb } from '../setup/test-app';

let moduleRef: TestingModule;

beforeAll(async () => {
  await getPrisma(); // sets the harness env
  moduleRef = await Test.createTestingModule({ imports: [ConfigModule, QueueModule] }).compile();
  await moduleRef.init();
});

beforeEach(resetDb);

afterAll(async () => {
  await moduleRef?.close();
  await closeHarness();
});

describe('queues', () => {
  it('lists the ten queue names', () => {
    expect([...QUEUE_NAMES]).toEqual([
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
    ]);
  });

  it('registers every queue, on the Redis db from REDIS_URL', async () => {
    const redis = await getRedis();
    for (const name of QUEUE_NAMES) {
      const queue = moduleRef.get<Queue>(getQueueToken(name));
      expect(queue.name).toBe(name);
      await queue.add('probe', { n: 1 });
    }
    // Keys landed in this worker's db (the harness client uses the same REDIS_URL db index).
    for (const name of QUEUE_NAMES) {
      expect(await redis.exists(`bull:${name}:meta`)).toBe(1);
    }
  });
});

describe('redisConnectionFromUrl', () => {
  it('parses host, port, db and credentials', () => {
    expect(redisConnectionFromUrl('redis://user:pw@example.com:6380/3')).toEqual({
      host: 'example.com',
      port: 6380,
      db: 3,
      username: 'user',
      password: 'pw',
    });
  });

  it('defaults port 6379 and db 0, and enables TLS for rediss://', () => {
    expect(redisConnectionFromUrl('redis://localhost')).toEqual({
      host: 'localhost',
      port: 6379,
      db: 0,
    });
    expect(redisConnectionFromUrl('rediss://h:1/0')).toMatchObject({ tls: {} });
  });
});
