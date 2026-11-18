import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { Client } from 'pg';
import type { TestProject } from 'vitest/node' with { 'resolution-mode': 'import' };

export const TEMPLATE_DB = 'kora_template';

export interface HarnessContext {
  /** Admin connection URL (database `postgres`); workers create their own database from the template. */
  pgAdminUrl: string;
  pgHost: string;
  pgPort: number;
  pgUser: string;
  pgPassword: string;
  redisHost: string;
  redisPort: number;
}

declare module 'vitest' {
  export interface ProvidedContext {
    harness: HarnessContext;
  }
}

/**
 * Runs once per `vitest run` (not per worker): starts postgres:17 and redis:7, applies the
 * migrations to a template database, and shares the connection details with workers via `inject`.
 * Each worker then clones the template into its own database (see test-app.ts), so test files
 * running in parallel never share rows.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const [pg, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:17').withDatabase('postgres').start(),
    // Many logical databases so every vitest worker can own one (FLUSHDB is per database).
    new RedisContainer('redis:7').withCommand(['redis-server', '--databases', '1024']).start(),
  ]);

  const admin = new Client({ connectionString: pg.getConnectionUri() });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${TEMPLATE_DB}`);
  await admin.end();

  const templateUrl = new URL(pg.getConnectionUri());
  templateUrl.pathname = `/${TEMPLATE_DB}`;
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: templateUrl.toString() },
    stdio: 'pipe',
  });

  project.provide('harness', {
    pgAdminUrl: pg.getConnectionUri(),
    pgHost: pg.getHost(),
    pgPort: pg.getPort(),
    pgUser: pg.getUsername(),
    pgPassword: pg.getPassword(),
    redisHost: redis.getHost(),
    redisPort: redis.getPort(),
  });

  return async () => {
    await Promise.all([pg.stop(), redis.stop()]);
  };
}
