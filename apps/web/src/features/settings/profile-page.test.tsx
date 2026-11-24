import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '@/components/theme-provider';
import type { Me } from '@/lib/me';
import {
  apiError,
  lastBody,
  renderAt,
  resetAuthTestState,
  stubApi,
  type Reply,
} from '../auth/test-helpers';

beforeEach(() => {
  resetAuthTestState();
  localStorage.removeItem(THEME_STORAGE_KEY);
});
afterEach(() => vi.unstubAllGlobals());

const base: Me = {
  user: {
    id: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    avatarUrl: null,
    locale: 'en',
    theme: 'system',
    timezone: 'UTC',
    emailVerifiedAt: '2026-01-01T00:00:00.000Z',
    hasPassword: true,
  },
  providers: [],
  workspaces: [],
};
const withUser = (user: Partial<Me['user']>, providers: Me['providers'] = []): Me => ({
  ...base,
  user: { ...base.user, ...user },
  providers,
});

function serve(
  profile: Me,
  handler: (path: string, init: RequestInit) => Reply | undefined = () => undefined,
) {
  return stubApi((path, init) => {
    const custom = handler(path, init);
    if (custom) return custom;
    if (path === '/me' && (init.method ?? 'GET') === 'GET') return { status: 200, body: profile };
    return undefined;
  });
}
const calls = (f: ReturnType<typeof stubApi>, method: string, suffix: string) =>
  f.mock.calls.filter(([u, i]) => String(u).endsWith(suffix) && (i?.method ?? 'GET') === method);

describe('profile settings page', () => {
  it('saves name, avatar and time zone through PATCH /me and confirms', async () => {
    const updated = withUser({
      name: 'Ada B',
      avatarUrl: 'https://example.com/a.png',
      timezone: 'Europe/Paris',
    });
    const fetchMock = serve(base, (path, init) =>
      path === '/me' && init.method === 'PATCH' ? { status: 200, body: updated } : undefined,
    );
    renderAt('/settings/profile');
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Ada B' } });
    fireEvent.change(screen.getByLabelText('Avatar URL'), {
      target: { value: 'https://example.com/a.png' },
    });
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Europe/Paris' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
    expect(lastBody(fetchMock)).toEqual({
      name: 'Ada B',
      avatarUrl: 'https://example.com/a.png',
      locale: 'en',
      timezone: 'Europe/Paris',
    });
  });

  it('rejects a non-https avatar URL without calling the API', async () => {
    const fetchMock = serve(base);
    renderAt('/settings/profile');
    fireEvent.change(await screen.findByLabelText('Avatar URL'), {
      target: { value: 'http://example.com/a.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter a valid https:// URL.')).toBeInTheDocument();
    expect(calls(fetchMock, 'PATCH', '/me')).toHaveLength(0);
  });

  it('lists every language but only enables English', async () => {
    serve(base);
    renderAt('/settings/profile');
    const language = await screen.findByLabelText('Language');
    const options = within(language).getAllByRole('option') as HTMLOptionElement[];
    expect(options.length).toBeGreaterThan(1);
    expect(options.filter((o) => !o.disabled).map((o) => o.value)).toEqual(['en']);
    expect(within(language).getByRole('option', { name: /Deutsch.*coming soon/ })).toBeDisabled();
  });

  it('applies a theme change immediately and persists it', async () => {
    const fetchMock = serve(base, (path, init) =>
      path === '/me' && init.method === 'PATCH'
        ? { status: 200, body: withUser({ theme: 'dark' }) }
        : undefined,
    );
    renderAt('/settings/profile');
    fireEvent.change(await screen.findByLabelText('Theme'), { target: { value: 'dark' } });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    await waitFor(() => expect(calls(fetchMock, 'PATCH', '/me')).toHaveLength(1));
    expect(lastBody(fetchMock)).toEqual({ theme: 'dark' });
  });

  describe('password', () => {
    const fill = async (current: string, next: string, confirm = next) => {
      fireEvent.change(await screen.findByLabelText('Current password'), {
        target: { value: current },
      });
      fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } });
      fireEvent.change(screen.getByLabelText('Confirm new password'), {
        target: { value: confirm },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    };

    it('changes the password and confirms', async () => {
      const fetchMock = serve(base);
      renderAt('/settings/profile');
      await fill('old password here', 'correct horse battery');
      expect(await screen.findByText('Password changed.')).toBeInTheDocument();
      expect(calls(fetchMock, 'PUT', '/me/password')).toHaveLength(1);
      expect(lastBody(fetchMock)).toEqual({
        currentPassword: 'old password here',
        newPassword: 'correct horse battery',
      });
    });

    it('blocks a mismatched confirmation', async () => {
      const fetchMock = serve(base);
      renderAt('/settings/profile');
      await fill('old password here', 'correct horse battery', 'something else entirely');
      expect(await screen.findByText('The passwords do not match.')).toBeInTheDocument();
      expect(calls(fetchMock, 'PUT', '/me/password')).toHaveLength(0);
    });

    it('shows a wrong current password on its field', async () => {
      serve(base, (path) =>
        path === '/me/password'
          ? apiError(422, 'VALIDATION', {
              fieldErrors: { currentPassword: ['PASSWORD_INCORRECT'] },
            })
          : undefined,
      );
      renderAt('/settings/profile');
      await fill('wrong password', 'correct horse battery');
      expect(await screen.findByText('The current password is incorrect.')).toBeInTheDocument();
    });

    it('is replaced by a hint for an account without a password', async () => {
      serve(withUser({ hasPassword: false }, ['github']));
      renderAt('/settings/profile');
      expect(await screen.findByText(/Forgot password/)).toBeInTheDocument();
      expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    });
  });

  it('lists the linked sign-in methods', async () => {
    serve(withUser({}, ['google', 'github']));
    renderAt('/settings/profile');
    const list = await screen.findByRole('list', { name: 'Sign-in methods' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Password', 'Google', 'GitHub']);
  });

  it('signs out of all devices after confirmation and goes to /login', async () => {
    const fetchMock = serve(base);
    const router = renderAt('/settings/profile');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out of all devices' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(calls(fetchMock, 'POST', '/auth/logout-all')).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out everywhere' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(calls(fetchMock, 'POST', '/auth/logout-all')).toHaveLength(1);
  });

  it('does nothing when the sign-out confirmation is cancelled', async () => {
    const fetchMock = serve(base);
    renderAt('/settings/profile');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out of all devices' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(calls(fetchMock, 'POST', '/auth/logout-all')).toHaveLength(0);
  });

  it('deletes the account after confirmation and goes to /login', async () => {
    const fetchMock = serve(base);
    const router = renderAt('/settings/profile');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(calls(fetchMock, 'DELETE', '/me')).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(calls(fetchMock, 'DELETE', '/me')).toHaveLength(1);
  });

  it('keeps the dialog open and shows an error when deleting fails', async () => {
    serve(base, (path, init) =>
      path === '/me' && init.method === 'DELETE' ? apiError(500, 'INTERNAL') : undefined,
    );
    const router = renderAt('/settings/profile');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(router.state.location.pathname).toBe('/settings/profile');
  });
});
