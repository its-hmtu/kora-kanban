import { expect, resetDb, test } from '../fixtures';

// Proves the e2e wiring: both web servers start, baseURL resolves, the SPA renders, and the API
// (behind the Vite proxy, NODE_ENV=test) accepts CSRF-protected requests.

test('the login page renders', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('resetDb wipes data through the test-only endpoint', async ({ request }) => {
  await resetDb(request);
});

test('twoUsers are independent browser contexts', async ({ twoUsers: { alice, bob } }) => {
  await alice.request.get('/api/v1/auth/csrf');
  const names = async (page: typeof alice) =>
    (await page.context().cookies()).map((cookie) => cookie.name);
  expect(await names(alice)).toContain('kora_csrf');
  expect(await names(bob)).toEqual([]);
});
