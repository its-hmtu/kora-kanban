import { expect, signUpAndLogin, test, uniqueEmail } from '../fixtures';

// Proves the e2e wiring: the web servers start (global-setup resets the data once), baseURL
// resolves, the SPA renders, and the API (behind the Vite proxy, NODE_ENV=test) accepts
// CSRF-protected requests.

test('the login page renders', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('signUpAndLogin leaves the browser context signed in', async ({ page }, testInfo) => {
  const email = uniqueEmail(testInfo);
  const user = await signUpAndLogin(page, { email, name: 'Smoke User' });
  expect(user.email).toBe(email);
  await page.goto('/');
  await expect(page.getByTestId('top-bar')).toContainText('Smoke User');
});

test('twoUsers are independent browser contexts', async ({ twoUsers: { alice, bob } }) => {
  await alice.request.get('/api/v1/auth/csrf');
  const names = async (page: typeof alice) =>
    (await page.context().cookies()).map((cookie) => cookie.name);
  expect(await names(alice)).toContain('kora_csrf');
  expect(await names(bob)).toEqual([]);
});
