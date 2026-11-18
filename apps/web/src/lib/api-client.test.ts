import { ErrorCode } from '@kora/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, resetApiClient, setLanguageGetter } from './api-client';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const envelope = (code: ErrorCode, message = 'nope', details?: Record<string, unknown>) => ({
  error: { code, message, details },
});

let fetchMock: ReturnType<typeof vi.fn>;
let assign: ReturnType<typeof vi.fn>;

function mockFetch(handler: Handler) {
  fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init)));
  vi.stubGlobal('fetch', fetchMock);
}
const headersOf = (init: RequestInit) => new Headers(init.headers);
const callsTo = (suffix: string) =>
  fetchMock.mock.calls.filter(([u]) => String(u).endsWith(suffix));

beforeEach(() => {
  resetApiClient();
  assign = vi.fn();
  vi.stubGlobal('location', { pathname: '/boards/1', search: '?x=1', assign });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('prefixes /api/v1, includes credentials, sends Accept-Language and query', async () => {
    setLanguageGetter(() => 'vi');
    mockFetch(() => json({ ok: true }));
    const res = await apiFetch<{ ok: boolean }>('/boards', {
      query: { a: 1, b: 'x y', c: undefined },
    });
    expect(res).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/boards?a=1&b=x+y');
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('GET');
    expect(headersOf(init).get('Accept-Language')).toBe('vi');
    expect(headersOf(init).get('X-CSRF-Token')).toBeNull();
    expect(callsTo('/auth/csrf')).toHaveLength(0);
  });

  it('defaults Accept-Language to document language', async () => {
    document.documentElement.lang = 'de';
    setLanguageGetter(undefined);
    mockFetch(() => json({}));
    await apiFetch('/x');
    expect(headersOf(fetchMock.mock.calls[0]![1]).get('Accept-Language')).toBe('de');
  });

  it('fetches the CSRF token lazily once and attaches it to mutations with a JSON body', async () => {
    mockFetch((url) =>
      url.endsWith('/auth/csrf') ? json({ csrfToken: 'tok1' }) : json({ id: 1 }),
    );
    await apiFetch('/cards', { method: 'POST', body: { title: 't' } });
    await apiFetch('/cards/1', { method: 'PATCH', body: { title: 'u' } });
    expect(callsTo('/auth/csrf')).toHaveLength(1);
    const csrfInit = callsTo('/auth/csrf')[0]![1] as RequestInit;
    expect(csrfInit.credentials).toBe('include');
    const post = callsTo('/cards')[0]![1] as RequestInit;
    expect(headersOf(post).get('X-CSRF-Token')).toBe('tok1');
    expect(headersOf(post).get('Content-Type')).toBe('application/json');
    expect(post.body).toBe(JSON.stringify({ title: 't' }));
    expect(headersOf(callsTo('/cards/1')[0]![1] as RequestInit).get('X-CSRF-Token')).toBe('tok1');
  });

  it('shares one in-flight CSRF request between concurrent mutations', async () => {
    mockFetch((url) => (url.endsWith('/auth/csrf') ? json({ csrfToken: 't' }) : json({})));
    await Promise.all([apiFetch('/a', { method: 'POST' }), apiFetch('/b', { method: 'DELETE' })]);
    expect(callsTo('/auth/csrf')).toHaveLength(1);
  });

  it('sends X-Client-Mutation-Id only when provided', async () => {
    mockFetch((url) => (url.endsWith('/auth/csrf') ? json({ csrfToken: 't' }) : json({})));
    await apiFetch('/a', { method: 'POST', clientMutationId: 'm-1' });
    await apiFetch('/b', { method: 'POST' });
    expect(headersOf(callsTo('/a')[0]![1] as RequestInit).get('X-Client-Mutation-Id')).toBe('m-1');
    expect(headersOf(callsTo('/b')[0]![1] as RequestInit).get('X-Client-Mutation-Id')).toBeNull();
  });

  it('returns undefined for 204', async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(apiFetch('/x')).resolves.toBeUndefined();
  });

  it('parses the error envelope into ApiError', async () => {
    mockFetch(() => json(envelope(ErrorCode.VALIDATION, 'bad', { field: 'title' }), 422));
    const err = await apiFetch('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({
      status: 422,
      code: ErrorCode.VALIDATION,
      message: 'bad',
      details: { field: 'title' },
    });
  });

  it('falls back to INTERNAL when the error body is not an envelope', async () => {
    mockFetch(() => new Response('<html>oops</html>', { status: 502 }));
    const err = await apiFetch('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 502, code: ErrorCode.INTERNAL });
  });

  describe('401', () => {
    it('redirects to /login?next=<current path> and still throws', async () => {
      mockFetch(() => json(envelope(ErrorCode.UNAUTHENTICATED), 401));
      await expect(apiFetch('/me')).rejects.toMatchObject({ status: 401 });
      expect(assign).toHaveBeenCalledWith(`/login?next=${encodeURIComponent('/boards/1?x=1')}`);
    });

    it('does not redirect when redirectOn401 is false', async () => {
      mockFetch(() => json(envelope(ErrorCode.UNAUTHENTICATED), 401));
      await expect(apiFetch('/me', { redirectOn401: false })).rejects.toBeInstanceOf(ApiError);
      expect(assign).not.toHaveBeenCalled();
    });

    it('does not redirect when already on /login', async () => {
      vi.stubGlobal('location', { pathname: '/login', search: '', assign });
      mockFetch(() => json(envelope(ErrorCode.UNAUTHENTICATED), 401));
      await expect(apiFetch('/auth/login', { method: 'POST' })).rejects.toBeInstanceOf(ApiError);
      expect(assign).not.toHaveBeenCalled();
    });
  });

  describe('403 on mutation (CSRF vs permission share FORBIDDEN)', () => {
    it('refetches the token once and retries once, succeeding', async () => {
      let tokens = 0;
      mockFetch((url, init) => {
        if (url.endsWith('/auth/csrf')) return json({ csrfToken: `t${++tokens}` });
        return headersOf(init).get('X-CSRF-Token') === 't2'
          ? json({ done: true })
          : json(envelope(ErrorCode.FORBIDDEN), 403);
      });
      await expect(apiFetch('/cards', { method: 'POST', body: {} })).resolves.toEqual({
        done: true,
      });
      expect(callsTo('/auth/csrf')).toHaveLength(2);
      expect(callsTo('/cards')).toHaveLength(2);
    });

    it('throws when the retry is also 403', async () => {
      mockFetch((url) =>
        url.endsWith('/auth/csrf')
          ? json({ csrfToken: 't' })
          : json(envelope(ErrorCode.FORBIDDEN), 403),
      );
      await expect(apiFetch('/cards', { method: 'POST' })).rejects.toMatchObject({
        status: 403,
        code: ErrorCode.FORBIDDEN,
      });
      expect(callsTo('/cards')).toHaveLength(2);
      expect(callsTo('/auth/csrf')).toHaveLength(2);
    });

    it('does not retry a 403 on GET', async () => {
      mockFetch(() => json(envelope(ErrorCode.FORBIDDEN), 403));
      await expect(apiFetch('/boards/1')).rejects.toMatchObject({ status: 403 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
