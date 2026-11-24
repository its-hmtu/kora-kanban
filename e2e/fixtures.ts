import {
  test as base,
  expect,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from '@playwright/test';

/**
 * Shared Playwright fixtures (T046). All API calls go through the web origin (the Vite dev server
 * proxies `/api` to the API), so cookies land where the browser expects them.
 *
 * Data policy: tests run fully parallel against one API and database, which is wiped once per run
 * (global-setup.ts), never per test. Every test creates its own data, e.g. `uniqueEmail(testInfo)`.
 */

/** Must equal the API's APP_URL: CsrfGuard requires `Origin` to match it on every POST. */
export const APP_ORIGIN = 'http://localhost:5173';
/** Password every e2e user signs up with. */
export const E2E_PASSWORD = 'kora-e2e-password-1';

export interface E2EUser {
  id: string;
  email: string;
  name: string;
}

/**
 * POST `path` (relative to /api/v1) the way the SPA does: fetch a CSRF token first
 * (`GET /auth/csrf` sets the `kora_csrf` cookie in this request context), then echo it in
 * `X-CSRF-Token` with `Origin` = APP_URL. Throws on a non-2xx response.
 */
async function apiPost(request: APIRequestContext, path: string, data?: unknown): Promise<unknown> {
  const csrf = await request.get('/api/v1/auth/csrf');
  expect(csrf.ok(), `GET /api/v1/auth/csrf → ${csrf.status()}`).toBe(true);
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const res = await request.post(`/api/v1${path}`, {
    data,
    headers: { 'X-CSRF-Token': csrfToken, Origin: APP_ORIGIN },
  });
  expect(res.ok(), `POST /api/v1${path} → ${res.status()} ${await res.text()}`).toBe(true);
  return res.status() === 204 ? undefined : res.json();
}

/**
 * Wipes the database and Redis via the test-only `POST /api/v1/__test/reset` (mounted only when
 * the API runs with NODE_ENV=test). Called once per run from global-setup.ts; never from a test,
 * since tests run in parallel against the same data.
 */
export async function resetDb(request: APIRequestContext): Promise<void> {
  await apiPost(request, '/__test/reset');
}

/** An email address no other test (or earlier run) uses, e.g. `<testId>-<time>@e2e.test`. */
export function uniqueEmail(testInfo: TestInfo): string {
  return `${testInfo.testId}-${Date.now()}@e2e.test`;
}

/**
 * Registers `{email, name}` through `POST /auth/register`, which signs the new (unverified) user
 * in: the `kora_sid` session cookie lands in `page`'s browser context.
 */
export async function signUpAndLogin(
  page: Page,
  { email, name }: { email: string; name: string },
): Promise<E2EUser> {
  const { user } = (await apiPost(page.request, '/auth/register', {
    email,
    password: E2E_PASSWORD,
    name,
  })) as { user: E2EUser };
  return user;
}

export interface Fixtures {
  /** Two pages in independent browser contexts (separate cookies/storage), e.g. for realtime. */
  twoUsers: { alice: Page; bob: Page };
}

export const test = base.extend<Fixtures>({
  twoUsers: async ({ browser, baseURL }, use) => {
    const [aliceContext, bobContext] = await Promise.all([
      browser.newContext({ baseURL }),
      browser.newContext({ baseURL }),
    ]);
    const [alice, bob] = await Promise.all([aliceContext.newPage(), bobContext.newPage()]);
    await use({ alice, bob });
    await Promise.all([aliceContext.close(), bobContext.close()]);
  },
});

export { expect };
