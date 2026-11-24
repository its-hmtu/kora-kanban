import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '@/lib/me';
import { apiError, renderAt, resetAuthTestState, stubApi } from '../test-helpers';

beforeEach(resetAuthTestState);
afterEach(() => vi.unstubAllGlobals());

const me = (user: Partial<Me['user']> = {}): Me => ({
  user: {
    id: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    avatarUrl: null,
    locale: 'en',
    theme: 'system',
    timezone: 'UTC',
    emailVerifiedAt: null,
    hasPassword: true,
    ...user,
  },
  providers: [],
  workspaces: [],
});

const serve = (profile: Me, resend = { status: 204 } as { status: number; body?: unknown }) =>
  stubApi((path) => (path === '/me' ? { status: 200, body: profile } : resend));

const resendCalls = (f: ReturnType<typeof stubApi>) =>
  f.mock.calls.filter(([u]) => String(u).endsWith('/auth/verify-email/resend'));

describe('verify-email banner', () => {
  it('is shown for an unverified user with a password and resends on request', async () => {
    const fetchMock = serve(me());
    renderAt('/');
    expect(await screen.findByText('Please verify your email')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resend' }));
    expect(await screen.findByText('Verification email sent.')).toBeInTheDocument();
    expect(resendCalls(fetchMock)).toHaveLength(1);
    expect(resendCalls(fetchMock)[0]?.[1]?.method).toBe('POST');
  });

  it('can be dismissed', async () => {
    serve(me());
    renderAt('/');
    await screen.findByText('Please verify your email');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Please verify your email')).not.toBeInTheDocument();
  });

  it('is hidden once the email is verified', async () => {
    serve(me({ emailVerifiedAt: '2026-01-01T00:00:00.000Z' }));
    renderAt('/');
    await screen.findByTestId('top-bar');
    expect(screen.queryByText('Please verify your email')).not.toBeInTheDocument();
  });

  it('is hidden for an account without a password', async () => {
    serve(me({ hasPassword: false }));
    renderAt('/');
    await screen.findByTestId('top-bar');
    expect(screen.queryByText('Please verify your email')).not.toBeInTheDocument();
  });

  it('shows a message when resending is throttled', async () => {
    serve(me(), apiError(429, 'RATE_LIMITED'));
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Resend' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts'));
  });
});
