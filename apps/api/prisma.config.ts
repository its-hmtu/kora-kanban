import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7: connection URL lives here (not in the schema). Loads apps/api/.env, then falls back to
// the process environment (CI / repo-root `.env` exported by the shell).
export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
