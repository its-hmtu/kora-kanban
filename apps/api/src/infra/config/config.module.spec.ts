import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG, ConfigModule } from './config.module';
import type { Env } from './env';

const valid = {
  DATABASE_URL: 'postgresql://kora:kora@localhost:5432/kora',
  REDIS_URL: 'redis://localhost:6379',
  APP_URL: 'http://localhost:5173',
  API_URL: 'http://localhost:3000',
  SESSION_SECRET: 'x'.repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  MAIL_FROM: 'Kora <noreply@kora.local>',
};

describe('ConfigModule', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('provides the parsed env under APP_CONFIG', async () => {
    for (const [k, v] of Object.entries(valid)) vi.stubEnv(k, v);
    const mod = await Test.createTestingModule({ imports: [ConfigModule] }).compile();
    expect(mod.get<Env>(APP_CONFIG).DATABASE_URL).toBe(valid.DATABASE_URL);
  });

  it('fails fast when a required variable is invalid', async () => {
    for (const [k, v] of Object.entries(valid)) vi.stubEnv(k, v);
    vi.stubEnv('DATABASE_URL', '');
    await expect(Test.createTestingModule({ imports: [ConfigModule] }).compile()).rejects.toThrow(
      /DATABASE_URL/,
    );
  });
});
