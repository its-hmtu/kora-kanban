import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7: connection URL lives here (not in the schema). Loads apps/api/.env (the prisma scripts
// run from apps/api; the app reads the same file via src/load-env.ts); real env vars win (CI).
export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
