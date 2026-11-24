import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetApiClientForTests } from '@/lib/api-client';
import { meQueryKey, type Me } from '@/lib/me';
import {
  useChangePassword,
  useForgotPassword,
  useLogin,
  useLogout,
  useLogoutAll,
  useMe,
  useRegister,
  useResetPassword,
  useUpdateMe,
  useVerifyEmail,
} from './api';

const me: Me = {
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
  },
  providers: [],
  workspaces: [],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const noContent = () => new Response(null, { status: 204 });

type Route = (init: RequestInit) => Response;
let fetchMock: ReturnType<typeof vi.fn>;
let csrfCalls: number;
let assign: ReturnType<typeof vi.fn>;

/** Stubs fetch: `/auth/csrf` hands out a new token each time; other paths use `routes`. */
function stubApi(routes: Record<string, Route>) {
  csrfCalls = 0;
  fetchMock = vi.fn((url: string, init: RequestInit = {}) => {
    const path = new URL(url, 'http://localhost').pathname.replace('/api/v1', '');
    if (path === '/auth/csrf') return Promise.resolve(json({ csrfToken: `csrf-${++csrfCalls}` }));
    const key = `${init.method ?? 'GET'} ${path}`;
    const route = routes[key];
    if (!route) throw new Error(`unexpected request ${key}`);
    return Promise.resolve(route(init));
  });
  vi.stubGlobal('fetch', fetchMock);
}
const callsTo = (method: string, path: string) =>
  fetchMock.mock.calls.filter(
    ([u, init]) =>
      String(u) === `/api/v1${path}` && ((init as RequestInit)?.method ?? 'GET') === method,
  );
const bodyOf = (method: string, path: string) =>
  JSON.parse(String((callsTo(method, path)[0]![1] as RequestInit).body)) as unknown;
const csrfHeaderOf = (call: unknown[]) =>
  new Headers((call[1] as RequestInit).headers).get('X-CSRF-Token');

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  __resetApiClientForTests();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, pathname: '/somewhere', search: '', assign });
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});

describe('useMe', () => {
  it('loads GET /me into the ["me"] query', async () => {
    stubApi({ 'GET /me': () => json(me) });
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(me);
    expect(client.getQueryData(meQueryKey)).toEqual(me);
  });
});

describe('useLogin / useRegister', () => {
  it.each([
    ['login', 'POST /auth/login', { email: 'a@example.com', password: 'pw' }] as const,
    [
      'register',
      'POST /auth/register',
      { email: 'a@example.com', password: 'a long password', name: 'Ada' },
    ] as const,
  ])(
    '%s posts the body, drops the cached user and the old CSRF token',
    async (name, key, input) => {
      stubApi({
        [key]: () => json({ user: me.user }, name === 'login' ? 200 : 201),
        'POST /auth/logout': noContent,
      });
      client.setQueryData(meQueryKey, { ...me, user: { ...me.user, name: 'Someone Else' } });
      const { result } = renderHook(
        () => ({ login: useLogin(), register: useRegister(), logout: useLogout() }),
        {
          wrapper,
        },
      );

      await act(() =>
        name === 'login'
          ? result.current.login.mutateAsync(input as { email: string; password: string })
          : result.current.register.mutateAsync(
              input as { email: string; password: string; name: string },
            ),
      );
      const path = key.split(' ')[1]!;
      expect(bodyOf('POST', path)).toEqual(input);
      expect(client.getQueryData(meQueryKey)).toBeUndefined();

      // Sign-in rotates kora_csrf: the next mutation must fetch a fresh token.
      await act(() => result.current.logout.mutateAsync());
      expect(csrfCalls).toBe(2);
      expect(csrfHeaderOf(callsTo('POST', '/auth/logout')[0]!)).toBe('csrf-2');
    },
  );

  it('a failed login (401) rejects without redirecting to /login', async () => {
    stubApi({
      'POST /auth/login': () => json({ error: { code: 'UNAUTHENTICATED', message: 'no' } }, 401),
    });
    const { result } = renderHook(() => useLogin(), { wrapper });
    await expect(
      act(() => result.current.mutateAsync({ email: 'a@example.com', password: 'bad' })),
    ).rejects.toMatchObject({ status: 401 });
    expect(assign).not.toHaveBeenCalled();
  });

  it('a register 401 does not redirect either', async () => {
    stubApi({
      'POST /auth/register': () => json({ error: { code: 'UNAUTHENTICATED', message: 'no' } }, 401),
    });
    const { result } = renderHook(() => useRegister(), { wrapper });
    await expect(
      act(() =>
        result.current.mutateAsync({ email: 'a@example.com', password: 'x'.repeat(12), name: 'A' }),
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('useLogout / useLogoutAll', () => {
  it.each([
    ['logout', '/auth/logout'],
    ['logoutAll', '/auth/logout-all'],
  ] as const)(
    '%s clears every cached query and the CSRF token, but does not navigate',
    async (name, path) => {
      stubApi({ [`POST ${path}`]: noContent, 'POST /auth/password/forgot': noContent });
      client.setQueryData(meQueryKey, me);
      client.setQueryData(['boards', 'b1'], { secret: true });
      const { result } = renderHook(
        () => ({ logout: useLogout(), logoutAll: useLogoutAll(), forgot: useForgotPassword() }),
        { wrapper },
      );

      await act(() => result.current[name].mutateAsync());
      expect(callsTo('POST', path)).toHaveLength(1);
      expect(client.getQueryCache().getAll()).toEqual([]);
      expect(assign).not.toHaveBeenCalled();

      await act(() => result.current.forgot.mutateAsync({ email: 'a@example.com' }));
      expect(csrfCalls).toBe(2);
    },
  );
});

describe('useForgotPassword / useResetPassword', () => {
  it('post their bodies and leave the cache alone', async () => {
    stubApi({ 'POST /auth/password/forgot': noContent, 'POST /auth/password/reset': noContent });
    client.setQueryData(meQueryKey, me);
    const { result } = renderHook(
      () => ({ forgot: useForgotPassword(), reset: useResetPassword() }),
      {
        wrapper,
      },
    );
    await act(() => result.current.forgot.mutateAsync({ email: 'a@example.com' }));
    await act(() => result.current.reset.mutateAsync({ token: 'tok', password: 'a new password' }));
    expect(bodyOf('POST', '/auth/password/forgot')).toEqual({ email: 'a@example.com' });
    expect(bodyOf('POST', '/auth/password/reset')).toEqual({
      token: 'tok',
      password: 'a new password',
    });
    expect(client.getQueryData(meQueryKey)).toEqual(me);
  });
});

describe('useVerifyEmail', () => {
  it('posts the token and refetches ["me"]', async () => {
    let verified = false;
    stubApi({
      'POST /auth/verify-email': () => {
        verified = true;
        return noContent();
      },
      'GET /me': () =>
        json({
          ...me,
          user: { ...me.user, emailVerifiedAt: verified ? '2026-01-01T00:00:00.000Z' : null },
        }),
    });
    const { result } = renderHook(() => ({ me: useMe(), verify: useVerifyEmail() }), { wrapper });
    await waitFor(() => expect(result.current.me.data?.user.emailVerifiedAt).toBeNull());

    await act(() => result.current.verify.mutateAsync({ token: 'tok' }));
    expect(bodyOf('POST', '/auth/verify-email')).toEqual({ token: 'tok' });
    await waitFor(() =>
      expect(result.current.me.data?.user.emailVerifiedAt).toBe('2026-01-01T00:00:00.000Z'),
    );
  });
});

describe('useUpdateMe', () => {
  it('PATCHes /me and stores the returned profile under ["me"]', async () => {
    const updated: Me = { ...me, user: { ...me.user, name: 'Countess' } };
    stubApi({ 'PATCH /me': () => json(updated) });
    client.setQueryData(meQueryKey, me);
    const { result } = renderHook(() => useUpdateMe(), { wrapper });
    await act(() => result.current.mutateAsync({ name: 'Countess' }));
    expect(bodyOf('PATCH', '/me')).toEqual({ name: 'Countess' });
    expect(client.getQueryData(meQueryKey)).toEqual(updated);
  });
});

describe('useChangePassword', () => {
  it('PUTs /me/password, invalidates ["me"] and drops the rotated CSRF token', async () => {
    stubApi({ 'PUT /me/password': noContent, 'PATCH /me': () => json(me) });
    client.setQueryData(meQueryKey, me);
    const { result } = renderHook(() => ({ change: useChangePassword(), update: useUpdateMe() }), {
      wrapper,
    });
    const input = { currentPassword: 'old one', newPassword: 'a brand new one' };
    await act(() => result.current.change.mutateAsync(input));
    expect(bodyOf('PUT', '/me/password')).toEqual(input);
    expect(client.getQueryState(meQueryKey)?.isInvalidated).toBe(true);

    await act(() => result.current.update.mutateAsync({ name: 'Ada' }));
    expect(csrfCalls).toBe(2);
  });
});
