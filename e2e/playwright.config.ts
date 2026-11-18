import { defineConfig, devices } from '@playwright/test';

const WEB_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3000';

/**
 * Environment for the API under e2e. NODE_ENV=test mounts the test-only `POST /api/v1/__test/reset`
 * (fixtures `resetDb`). It uses its own database and Redis logical database so resets never touch
 * development data; override with E2E_DATABASE_URL / E2E_REDIS_URL. The remaining values are
 * throwaway test settings, not secrets. Real env vars win over `apps/api/.env` (load-env), so
 * these apply even when that file exists.
 */
const apiEnv = {
  NODE_ENV: 'test',
  PORT: new URL(API_URL).port,
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgresql://kora:kora@localhost:5432/kora_e2e',
  REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/1',
  APP_URL: WEB_URL,
  API_URL,
  SESSION_SECRET: 'e2e-session-secret-e2e-session-secret',
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  MAIL_FROM: 'Kora <noreply@kora.test>',
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      // Built API (turbo builds it before `e2e`); migrations applied to the e2e database first.
      command:
        'pnpm --filter @kora/api exec prisma migrate deploy && pnpm --filter @kora/api start',
      cwd: '..',
      url: `${API_URL}/healthz`,
      env: apiEnv,
      // Never reuse: a dev API on :3000 runs without NODE_ENV=test against the dev database.
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @kora/web dev',
      cwd: '..',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
