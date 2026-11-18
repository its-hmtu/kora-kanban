import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Shared Playwright fixtures (T046). All API calls go through the web origin (the Vite dev server
 * proxies `/api` to the API), so cookies land where the browser expects them.
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
 * the API runs with NODE_ENV=test). Affects every test using the same API, so call it only where
 * tests cannot run concurrently against shared data.
 */
export async function resetDb(request: APIRequestContext): Promise<void> {
  await apiPost(request, '/__test/reset');
}

/**
 * Registers `{email, name}` and signs in, leaving the `kora_sid` session cookie in `page`'s
 * browser context.
 *
 * NOT YET EXERCISED: written against the planned contract (contracts/rest-api.md, Auth & account:
 * `POST /auth/register {email, password, name}` → 201, `POST /auth/login {email, password}` →
 * `{user}` + cookie). The endpoints arrive with US1; revisit once they exist (e.g. if login
 * requires a verified email).
 */
export async function signUpAndLogin(
  page: Page,
  { email, name }: { email: string; name: string },
): Promise<E2EUser> {
  await apiPost(page.request, '/auth/register', { email, password: E2E_PASSWORD, name });
  const { user } = (await apiPost(page.request, '/auth/login', {
    email,
    password: E2E_PASSWORD,
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
