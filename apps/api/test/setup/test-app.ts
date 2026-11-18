import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { Redis } from 'ioredis';
import request from 'supertest';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { CSRF_COOKIE, CSRF_HEADER } from '../../src/common/guards/csrf.guard';
import { APP_CONFIG } from '../../src/infra/config/config.module';
import { loadEnv, type Env } from '../../src/infra/config/env';
import { CryptoService } from '../../src/infra/crypto/crypto.service';
import { PrismaService } from '../../src/infra/prisma/prisma.service';
import { SESSION_COOKIE, SessionService } from '../../src/modules/auth/session.service';
import { resetAppData } from '../../src/modules/health/reset-app-data';
import { TEMPLATE_DB } from './constants';

/**
 * Integration harness (T038). Containers are started once per run by global-setup.ts. Each vitest
 * worker owns a Postgres database cloned from the migrated template and a Redis logical database
 * (index = worker pool id), so files running in parallel are isolated.
 *
 * Spec usage: `beforeEach(resetDb)` and one top-level `afterAll(closeHarness)` per file.
 */

const poolId = Number(process.env.VITEST_POOL_ID ?? '1');
const workerDb = `kora_w${poolId}`;
/** Supertest always talks to 127.0.0.1, so agent cookies are scoped to that host. */
const AGENT_HOST = '127.0.0.1';

interface Harness {
  prisma: PrismaService;
  redis: Redis;
}

let harness: Promise<Harness> | undefined;
let testApp: NestExpressApplication | undefined;

async function createWorkerDatabase(adminUrl: string): Promise<void> {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      workerDb,
    ]);
    if (!rowCount) await admin.query(`CREATE DATABASE ${workerDb} TEMPLATE ${TEMPLATE_DB}`);
  } finally {
    await admin.end();
  }
}

async function start(): Promise<Harness> {
  const ctx = inject('harness');
  await createWorkerDatabase(ctx.pgAdminUrl);

  const dbUrl = new URL(ctx.pgAdminUrl);
  dbUrl.pathname = `/${workerDb}`;

  // Valid dummy values for every required variable so loadEnv() passes in tests.
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: dbUrl.toString(),
    REDIS_URL: `redis://${ctx.redisHost}:${ctx.redisPort}/${poolId}`,
    APP_URL: 'http://localhost:5173',
    API_URL: 'http://localhost:3000',
    SESSION_SECRET: 'test-session-secret-test-session-secret',
    ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    MAIL_FROM: 'Kora <noreply@kora.test>',
  });

  const env = loadEnv();
  const prisma = new PrismaService(env);
  await prisma.onModuleInit();
  const redis = new Redis(env.REDIS_URL);
  return { prisma, redis };
}

const get = (): Promise<Harness> => (harness ??= start());

/** The real PrismaService connected to this worker's database. */
export const getPrisma = async (): Promise<PrismaService> => (await get()).prisma;

/** ioredis client connected to this worker's logical Redis database. */
export const getRedis = async (): Promise<Redis> => (await get()).redis;

export interface CreateTestAppOptions {
  /** Extra (probe) controllers mounted next to AppModule's own routes. */
  controllers?: Type[];
}

/**
 * Boots the full AppModule (every global module, guard and the exception filter) against this
 * worker's database and Redis, configured exactly like `main.ts`. One app per spec file;
 * `closeHarness()` closes it.
 */
export async function createTestApp(
  options: CreateTestAppOptions = {},
): Promise<NestExpressApplication> {
  if (testApp) throw new Error('createTestApp() was already called in this file');
  await get(); // sets the worker env that ConfigModule validates at boot
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, app.get<Env>(APP_CONFIG));
  await app.init();
  testApp = app;
  return app;
}

/**
 * A Supertest agent signed in as `user` on the app from `createTestApp()`: a real `kora_sid`
 * session cookie (SessionService.create), a `kora_csrf` cookie with the matching `X-CSRF-Token`
 * header, and `Origin` = APP_URL, so state-changing requests pass every global guard. Cookies the
 * server sets later (e.g. a slid session) are kept by the agent.
 */
export async function agentFor(user: { id: string }): Promise<request.Agent> {
  if (!testApp) throw new Error('Call createTestApp() before agentFor()');
  const token = await testApp.get(SessionService).create(user.id, {
    headers: { 'user-agent': 'kora-test' },
    ip: AGENT_HOST,
  });
  const csrfToken = testApp.get(CryptoService).randomToken();
  const { APP_URL } = testApp.get<Env>(APP_CONFIG);

  const agent = request.agent(testApp.getHttpServer());
  agent.jar.setCookies(
    [`${SESSION_COOKIE}=${token}; Path=/`, `${CSRF_COOKIE}=${csrfToken}; Path=/`],
    AGENT_HOST,
    '/',
  );
  agent.set('Origin', new URL(APP_URL).origin).set(CSRF_HEADER, csrfToken);
  return agent;
}

/** Truncates every app table (not `_prisma_migrations`) and flushes this worker's Redis database. */
export async function resetDb(): Promise<void> {
  const { prisma, redis } = await get();
  await resetAppData(prisma, redis);
}

/** Closes the app from `createTestApp()` and disconnects clients; one top-level `afterAll` per file. */
export async function closeHarness(): Promise<void> {
  const app = testApp;
  testApp = undefined;
  await app?.close();
  if (!harness) return;
  const { prisma, redis } = await harness;
  harness = undefined;
  redis.disconnect();
  await prisma.onModuleDestroy();
}
