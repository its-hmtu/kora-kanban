import path from 'node:path';
import { config } from 'dotenv';

/**
 * Local development: load `apps/api/.env` (the same file prisma.config.ts reads) into process.env.
 * Resolved from this file (dist/ or src/ → apps/api) so the working directory does not matter.
 * A missing file is fine, and real environment variables always win (no override).
 * Import first in every entrypoint.
 */
config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
