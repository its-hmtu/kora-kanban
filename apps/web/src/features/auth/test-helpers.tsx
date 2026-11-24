import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { vi } from 'vitest';
import { renderWithI18n } from '../../../test/i18n';
import { __resetApiClientForTests } from '@/lib/api-client';
import { queryClient } from '@/lib/query-client';
import { createAppRouter } from '@/router';

export type Reply = { status: number; body?: unknown };
type Handler = (path: string, init: RequestInit) => Reply | undefined;

export function resetAuthTestState() {
  queryClient.clear();
  __resetApiClientForTests();
}

/** Stubs fetch: serves the CSRF endpoint, delegates the rest to `handler` (default 204). */
export function stubApi(handler: Handler = () => ({ status: 204 })) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace('/api/v1', '');
    if (path === '/auth/csrf') {
      return new Response(JSON.stringify({ csrfToken: 'tok' }), { status: 200 });
    }
    const reply = handler(path, init) ?? { status: 204 };
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export const apiError = (status: number, code: string, details?: unknown): Reply => ({
  status,
  body: { error: { code, message: code, details } },
});

/** Body of the last request that sent one, parsed. */
export function lastBody(fetchMock: ReturnType<typeof stubApi>): unknown {
  const calls = fetchMock.mock.calls.filter(([, init]) => init?.body !== undefined);
  const init = calls[calls.length - 1]?.[1] as RequestInit | undefined;
  return init?.body ? JSON.parse(String(init.body)) : undefined;
}

export function renderAt(path: string) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  renderWithI18n(<RouterProvider router={router} />);
  return router;
}
