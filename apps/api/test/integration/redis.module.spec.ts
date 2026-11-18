import type { LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, expect, it, vi } from 'vitest';
import { APP_CONFIG, ConfigModule } from '../../src/infra/config/config.module';
import { loadEnv } from '../../src/infra/config/env';
import { RedisModule } from '../../src/infra/redis/redis.module';
import { closeHarness, getPrisma } from '../setup/test-app';

afterAll(closeHarness);

it('logs Redis connection errors through the app logger and still shuts down promptly', async () => {
  await getPrisma(); // harness env so loadEnv() passes
  const errors: string[] = [];
  const logger: LoggerService = {
    log: () => undefined,
    warn: () => undefined,
    error: (message: unknown) => void errors.push(String(message)),
  };
  const moduleRef = await Test.createTestingModule({ imports: [ConfigModule, RedisModule] })
    .overrideProvider(APP_CONFIG)
    .useValue({ ...loadEnv(), REDIS_URL: 'redis://127.0.0.1:1/0' })
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.useLogger(logger);
  await app.init();

  await vi.waitFor(() => expect(errors.some((e) => e.includes('ECONNREFUSED'))).toBe(true));

  const started = Date.now();
  await app.close();
  expect(Date.now() - started).toBeLessThan(2_000);
});
