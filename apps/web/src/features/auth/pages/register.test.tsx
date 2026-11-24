import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, lastBody, renderAt, resetAuthTestState, stubApi } from '../test-helpers';

beforeEach(resetAuthTestState);
afterEach(() => vi.unstubAllGlobals());

const created = {
  status: 201,
  body: { user: { id: 'u', email: 'a@b.co', name: 'Ada', emailVerifiedAt: null } },
};

const me = {
  user: {
    id: 'u',
    email: 'a@b.co',
    name: 'Ada',
    avatarUrl: null,
    locale: 'en',
    theme: 'system',
    timezone: 'UTC',
    emailVerifiedAt: null,
    hasPassword: true,
  },
  providers: [],
  workspaces: [],
};

async function fill(password = 'correct horse battery') {
  fireEvent.change(await screen.findByLabelText('Name'), { target: { value: ' Ada ' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('register page', () => {
  it('registers, is signed in and goes to /', async () => {
    const fetchMock = stubApi((path) =>
      path === '/auth/register' ? created : { status: 200, body: me },
    );
    const router = renderAt('/register');
    await fill();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(lastBody(fetchMock)).toEqual({
      email: 'a@b.co',
      password: 'correct horse battery',
      name: 'Ada',
    });
  });

  it('shows EMAIL_TAKEN on the email field', async () => {
    stubApi(() => apiError(422, 'VALIDATION', { fieldErrors: { email: ['EMAIL_TAKEN'] } }));
    renderAt('/register');
    await fill();
    expect(
      await screen.findByText('An account with this email already exists.'),
    ).toBeInTheDocument();
  });

  it('shows PASSWORD_BREACHED on the password field', async () => {
    stubApi(() =>
      apiError(422, 'VALIDATION', { fieldErrors: { password: ['PASSWORD_BREACHED'] } }),
    );
    renderAt('/register');
    await fill();
    expect(await screen.findByText(/appeared in a data breach/)).toBeInTheDocument();
  });

  it('shows the throttled message on 429', async () => {
    stubApi(() => apiError(429, 'RATE_LIMITED'));
    renderAt('/register');
    await fill();
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
  });

  it('rejects a short password client-side', async () => {
    const fetchMock = stubApi();
    renderAt('/register');
    await fill('short');
    expect(await screen.findByText(/Use at least \d+ characters/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('has OAuth buttons and a link to login', async () => {
    stubApi();
    renderAt('/register');
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
      'href',
      '/api/v1/auth/oauth/google?next=%2F',
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });
});
