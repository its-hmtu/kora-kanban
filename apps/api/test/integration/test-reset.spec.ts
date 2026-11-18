import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CSRF_COOKIE, CSRF_HEADER } from '../../src/common/guards/csrf.guard';
import { loadEnv, type Env } from '../../src/infra/config/env';
import { TestResetController } from '../../src/modules/health/test-reset.controller';
import { createUser } from '../setup/factories';
import { closeHarness, createTestApp, getPrisma, getRedis, resetDb } from '../setup/test-app';

const RESET = '/api/v1/__test/reset';
const CSRF = 'csrf-token-for-reset-spec';

/** A state-changing request that passes CsrfGuard (Origin = APP_URL, double-submit token). */
const resetRequest = (app: NestExpressApplication) =>
  request(app.getHttpServer())
    .post(RESET)
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', `${CSRF_COOKIE}=${CSRF}`)
    .set(CSRF_HEADER, CSRF);

afterAll(closeHarness);

describe('POST /api/v1/__test/reset (NODE_ENV=test)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(resetDb);

  it('truncates every app table and flushes Redis, anonymously', async () => {
    await createUser();
    const redis = await getRedis();
    await redis.set('some-key', '1');

    await resetRequest(app).expect(204);

    expect(await (await getPrisma()).client.user.count()).toBe(0);
    expect(await redis.dbsize()).toBe(0);
  });

  it('is CSRF-protected like every other POST', async () => {
    await createUser();
    await resetRequest(app).unset(CSRF_HEADER).expect(403);
    expect(await (await getPrisma()).client.user.count()).toBe(1);
  });
});

describe.each(['development', 'production'] as const)(
  'POST /api/v1/__test/reset (NODE_ENV=%s)',
  (nodeEnv) => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      await getPrisma(); // harness env: real database and Redis for this worker
      // AppModule decides at definition time; re-evaluate it under the target NODE_ENV.
      vi.resetModules();
      process.env.NODE_ENV = nodeEnv;
      const { AppModule } = await import('../../src/app.module.js');
      // Boot under 'test' again so only route registration differs (and logging stays silent).
      process.env.NODE_ENV = 'test';
      const { configureApp } = await import('../../src/app.setup.js');
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication<NestExpressApplication>();
      configureApp(app, loadEnv());
      await app.init();
    });
    afterAll(async () => {
      process.env.NODE_ENV = 'test';
      await app.close();
    });

    it('does not exist (404) and deletes nothing', async () => {
      await resetDb();
      await createUser();
      await resetRequest(app).expect(404);
      expect(await (await getPrisma()).client.user.count()).toBe(1);
    });
  },
);

describe('TestResetController handler guard', () => {
  it.each(['development', 'production'] as const)(
    'refuses with 404 if ever mounted under NODE_ENV=%s',
    async (nodeEnv) => {
      const prisma = await getPrisma();
      const redis = await getRedis();
      await resetDb();
      await createUser();
      const config = { ...loadEnv(), NODE_ENV: nodeEnv } satisfies Env;
      const controller = new TestResetController(prisma, redis, config);
      await expect(controller.reset()).rejects.toMatchObject({ status: 404 });
      expect(await prisma.client.user.count()).toBe(1);
    },
  );
});
