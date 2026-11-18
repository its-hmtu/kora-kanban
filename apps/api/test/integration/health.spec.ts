import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { APP_CONFIG } from '../../src/infra/config/config.module';
import { loadEnv } from '../../src/infra/config/env';
import { closeHarness, createTestApp, getPrisma } from '../setup/test-app';

afterAll(closeHarness);

describe('GET /healthz', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  it('is public, outside api/v1, and reports every dependency ok', async () => {
    const res = await request(app.getHttpServer()).get('/healthz').expect(200);
    expect(res.body).toEqual({ status: 'ok', checks: { db: 'ok', redis: 'ok', queue: 'ok' } });
    await request(app.getHttpServer()).get('/api/v1/healthz').expect(404);
  });
});

describe('GET /healthz with Redis unreachable', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    await getPrisma(); // harness env: a real database, so only the Redis checks fail
    // Port 1 on loopback refuses connections: Redis and the BullMQ connection are both down.
    const env = { ...loadEnv(), REDIS_URL: 'redis://127.0.0.1:1/0' };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(env)
      .compile();
    // logger: false keeps the expected Redis connection errors out of the test output.
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, env);
    await app.init();
  });

  afterAll(() => app?.close());

  it('answers 503 naming the failing checks', async () => {
    const res = await request(app.getHttpServer()).get('/healthz').expect(503);
    expect(res.body).toEqual({
      status: 'error',
      checks: { db: 'ok', redis: 'error', queue: 'error' },
    });
  });
});
