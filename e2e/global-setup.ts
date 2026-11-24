import { request, type FullConfig } from '@playwright/test';
import { resetDb } from './fixtures';

/**
 * Runs once per Playwright run, after the web servers are up: wipes the e2e database and Redis so
 * every run starts clean. Tests never reset (they run in parallel and use unique data instead).
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const context = await request.newContext({ baseURL: config.projects[0]?.use.baseURL });
  try {
    await resetDb(context);
  } finally {
    await context.dispose();
  }
}
