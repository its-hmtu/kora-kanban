import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, lastBody, renderAt, resetAuthTestState, stubApi } from '../test-helpers';

vi.mock('sonner', () => ({ toast: { error: vi.fn() }, Toaster: () => null }));

beforeEach(() => {
  resetAuthTestState();
  vi.mocked(toast.error).mockClear();
});
afterEach(() => vi.unstubAllGlobals());

const ok = {
  status: 200,
  body: { user: { id: 'u', email: 'a@b.co', name: 'A', emailVerifiedAt: null } },
};

const me = {
  user: {
    id: 'u',
    email: 'a@b.co',
    name: 'A',
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

async function fill(email: string, password: string) {
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('login page', () => {
  it('signs in and navigates to the safe next target', async () => {
    const fetchMock = stubApi((path) => (path === '/auth/login' ? ok : { status: 200, body: me }));
    const router = renderAt('/login?next=%2F%3Fboard%3D1');
    await fill('A@B.co', 'secret');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toEqual({ board: 1 });
    expect(lastBody(fetchMock)).toEqual({ email: 'a@b.co', password: 'secret' });
  });

  it('shows the generic message on 401', async () => {
    stubApi(() => apiError(401, 'UNAUTHENTICATED'));
    const router = renderAt('/login');
    await fill('a@b.co', 'wrong');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The email or password is incorrect.',
    );
    expect(router.state.location.pathname).toBe('/login');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows the throttled message on 429', async () => {
    stubApi(() => apiError(429, 'RATE_LIMITED'));
    renderAt('/login');
    await fill('a@b.co', 'x');
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
  });

  it('validates the email client-side without calling the API', async () => {
    const fetchMock = stubApi();
    renderAt('/login');
    await fill('nope', 'x');
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['oauth_failed', 'Sign-in with that provider failed'],
    ['oauth_email_unverified', 'has not verified your email'],
  ])('shows an alert for ?error=%s', async (code, text) => {
    stubApi();
    renderAt(`/login?error=${code}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('links the OAuth buttons to the API start routes with an encoded next', async () => {
    stubApi();
    renderAt('/login?next=%2Fboards%2F1%3Fx%3D1');
    const google = await screen.findByRole('link', { name: 'Continue with Google' });
    expect(google).toHaveAttribute('href', '/api/v1/auth/oauth/google?next=%2Fboards%2F1%3Fx%3D1');
    expect(screen.getByRole('link', { name: 'Continue with GitHub' })).toHaveAttribute(
      'href',
      '/api/v1/auth/oauth/github?next=%2Fboards%2F1%3Fx%3D1',
    );
  });

  it('links to register and forgot-password', async () => {
    stubApi();
    renderAt('/login');
    expect(await screen.findByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });
});

describe('login page validation', () => {
  it('says required (not a minimum length) for an empty password', async () => {
    const fetchMock = stubApi();
    renderAt('/login');
    await fill('a@b.co', '');
    expect(await screen.findByText('This field is required.')).toBeInTheDocument();
    expect(screen.queryByText(/Use at least/)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
