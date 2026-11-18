import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { renderWithI18n } from '../test/i18n';
import { __resetApiClientForTests } from '@/lib/api-client';
import { queryClient } from '@/lib/query-client';
import { createAppRouter } from './router';

const me = {
  id: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  locale: 'en',
  theme: 'system',
  timezone: 'UTC',
};

function stubMe(status: number) {
  const fetchMock = vi.fn(async () =>
    status === 200
      ? new Response(JSON.stringify(me), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
      : new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'no' } }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderAt(path: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  renderWithI18n(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  queryClient.clear();
  __resetApiClientForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('_app route guard', () => {
  it('renders the shell (top bar, sidebar, page) when /me returns 200', async () => {
    const fetchMock = stubMe(200);
    const router = renderAt('/');

    expect(await screen.findByTestId('top-bar')).toHaveTextContent('Kora');
    expect(screen.getByTestId('top-bar')).toHaveTextContent('Ada Lovelace');
    expect(screen.getByTestId('sidebar')).toHaveTextContent(
      'Workspaces and boards will appear here.',
    );
    expect(screen.getByTestId('index-page')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/me',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('redirects to /login?next=<path> on 401 without the shell', async () => {
    stubMe(401);
    const router = renderAt('/?board=1');

    expect(await screen.findByTestId('login-page')).toHaveTextContent('Sign in');
    expect(screen.queryByTestId('top-bar')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toEqual({ next: '/?board=1' });
  });

  it('does not use the api client redirect (window.location is untouched)', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, pathname: '/', search: '', assign });
    stubMe(401);
    renderAt('/');
    await screen.findByTestId('login-page');
    expect(assign).not.toHaveBeenCalled();
  });

  it('shows the error boundary rather than redirecting on a server error', async () => {
    // The production client retries 5xx with backoff (~3s); disable that so the test is fast.
    const defaults = queryClient.getDefaultOptions();
    queryClient.setDefaultOptions({ queries: { ...defaults.queries, retry: false } });
    onTestFinished(() => queryClient.setDefaultOptions(defaults));
    // The router logs the unhandled error; keep the test output pristine.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubMe(500);
    const router = renderAt('/');
    // Positive signal first: the router's default error component has rendered.
    expect(await screen.findByText('Something went wrong!')).toBeInTheDocument();
    expect(screen.queryByTestId('top-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('public _auth layout', () => {
  it('renders /login without calling /me', async () => {
    const fetchMock = stubMe(401);
    renderAt('/login');
    expect(await screen.findByTestId('app-shell')).toBeInTheDocument();
    expect(await screen.findByTestId('auth-layout')).toBeInTheDocument();
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['//evil.com', '/\\evil.com', 'https://evil.com'])(
    'drops an unsafe next=%s',
    async (next) => {
      stubMe(401);
      const router = renderAt(`/login?next=${encodeURIComponent(next)}`);
      await screen.findByTestId('login-page');
      expect(router.state.location.search).toEqual({ next: '/' });
    },
  );

  it('keeps a safe next', async () => {
    stubMe(401);
    const router = renderAt(`/login?next=${encodeURIComponent('/boards/1')}`);
    await screen.findByTestId('login-page');
    expect(router.state.location.search).toEqual({ next: '/boards/1' });
  });
});
