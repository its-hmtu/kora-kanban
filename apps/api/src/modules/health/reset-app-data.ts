import type { Redis } from 'ioredis';
import type { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Wipes all application data: truncates every table in `public` except `_prisma_migrations` and
 * flushes the current Redis logical database. Test use only — shared by the integration harness
 * (`test/setup/test-app.ts`) and the e2e reset endpoint (`TestResetController`).
 */
export async function resetAppData(prisma: PrismaService, redis: Redis): Promise<void> {
  const tables = await prisma.client.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await prisma.client.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
  await redis.flushdb();
}
