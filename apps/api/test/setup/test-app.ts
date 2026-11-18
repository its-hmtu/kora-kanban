import { Client } from 'pg';
import { Redis } from 'ioredis';
import { inject } from 'vitest';
import { PrismaService } from '../../src/infra/prisma/prisma.service';
import { loadEnv } from '../../src/infra/config/env';
import { TEMPLATE_DB } from './global-setup';

/**
 * Integration harness (part a of T038). Containers are started once per run by global-setup.ts.
 * Each vitest worker owns a Postgres database cloned from the migrated template and a Redis
 * logical database (index = worker pool id), so files running in parallel are isolated.
 * `createTestApp()` / `agentFor()` (part b) will be added here later.
 */

const poolId = Number(process.env.VITEST_POOL_ID ?? '1');
const workerDb = `kora_w${poolId}`;

interface Harness {
  prisma: PrismaService;
  redis: Redis;
}

let harness: Promise<Harness> | undefined;

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

/** Truncates every app table (not `_prisma_migrations`) and flushes this worker's Redis database. */
export async function resetDb(): Promise<void> {
  const { prisma, redis } = await get();
  const tables = await prisma.client.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await prisma.client.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
  await redis.flushdb();
}

/** Disconnects clients; call from `afterAll` in each spec file. */
export async function closeHarness(): Promise<void> {
  if (!harness) return;
  const { prisma, redis } = await harness;
  harness = undefined;
  redis.disconnect();
  await prisma.onModuleDestroy();
}
