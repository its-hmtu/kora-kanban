import type { Page } from '@playwright/test';
import { APP_ORIGIN, E2E_PASSWORD, expect, test, uniqueEmail } from '../fixtures';
import { waitForEmailLink } from '../mailpit';

// T061: the whole email/password account flow through the UI, with emails read from Mailpit.

const NEW_PASSWORD = 'kora-e2e-new-password-2';

test('register, verify, sign out, sign in, reset the password and sign in with it', async ({
  page,
}, testInfo) => {
  const email = uniqueEmail(testInfo);
  const name = 'E2E Auth User';

  // Register: signs in and lands in the app, with the "verify your email" banner.
  await page.goto('/register');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByTestId('index-page')).toBeAttached();
  await expect(page.getByTestId('top-bar')).toContainText(name);
  await expect(page.getByText('Please verify your email')).toBeVisible();

  // Verify through the emailed link.
  const verifyLink = await waitForEmailLink(page.request, {
    email,
    origin: APP_ORIGIN,
    path: '/verify-email',
  });
  await page.goto(verifyLink);
  await expect(page.getByText('Your email address is verified.')).toBeVisible();
  await page.getByRole('link', { name: 'Continue to Kora' }).click();
  await expect(page.getByTestId('index-page')).toBeAttached();
  await expect(page.getByText('Please verify your email')).toBeHidden();

  // Sign out from the profile settings (the app's only sign-out control so far).
  await page.getByRole('link', { name }).click();
  await page.getByRole('button', { name: 'Sign out of all devices' }).click();
  await page.getByRole('button', { name: 'Sign out everywhere' }).click();
  await expect(page.getByTestId('login-page')).toBeVisible();
  await page.goto('/');
  await expect(page.getByTestId('login-page')).toBeVisible();

  // Sign in with the original password.
  await signIn(page, email, E2E_PASSWORD);
  await expect(page.getByTestId('top-bar')).toContainText(name);

  // Forgot password, then reset through the emailed link (which signs out every session).
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByTestId('forgot-password-page')).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('If an account exists for that address')).toBeVisible();
  const resetLink = await waitForEmailLink(page.request, {
    email,
    origin: APP_ORIGIN,
    path: '/reset-password',
  });
  await page.goto(resetLink);
  await page.getByLabel('New password').fill(NEW_PASSWORD);
  await page.getByLabel('Confirm password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByText('Your password has been reset.')).toBeVisible();
  await page.getByRole('link', { name: 'Go to sign in' }).click();

  // The old password no longer works; the new one does.
  await signIn(page, email, E2E_PASSWORD);
  await expect(page.getByText('The email or password is incorrect.')).toBeVisible();
  await signIn(page, email, NEW_PASSWORD);
  await expect(page.getByTestId('index-page')).toBeAttached();
  await expect(page.getByTestId('top-bar')).toContainText(name);
});

async function signIn(page: Page, email: string, password: string) {
  await expect(page.getByTestId('login-page')).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
