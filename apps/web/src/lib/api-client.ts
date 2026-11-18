import { ErrorCode, type ApiError as ApiErrorEnvelope } from '@kora/shared';

const API_PREFIX = '/api/v1';

/** Error thrown for every non-2xx response; built from the server's `ApiError` envelope. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Echoed back by the realtime layer so the originating client can ignore its own events. */
  clientMutationId?: string;
  /** Set to false for probes (e.g. the `/me` route guard) that must not redirect on 401. */
  redirectOn401?: boolean;
}

// Single seam for the language header; i18n registers `() => i18n.language`.
let getLanguage: (() => string) | undefined;
export function setLanguageGetter(fn: (() => string) | undefined): void {
  getLanguage = fn;
}
const currentLanguage = () => getLanguage?.() ?? (document.documentElement.lang || 'en');

let csrfToken: Promise<string> | undefined;

function loadCsrfToken(): Promise<string> {
  csrfToken ??= fetch(`${API_PREFIX}/auth/csrf`, { credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) throw await toApiError(res);
      return ((await res.json()) as { csrfToken: string }).csrfToken;
    })
    .catch((err: unknown) => {
      csrfToken = undefined; // do not cache failures
      throw err;
    });
  return csrfToken;
}

/** Clears the cached CSRF token (logout: the next mutation fetches a token for the new session). */
export function resetCsrfToken(): void {
  csrfToken = undefined;
}

/** Test-only: clears all module state, including the language getter. */
export function __resetApiClientForTests(): void {
  csrfToken = undefined;
  getLanguage = undefined;
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const { error } = (await res.json()) as ApiErrorEnvelope;
    return new ApiError(res.status, error.code, error.message, error.details);
  } catch {
    return new ApiError(res.status, ErrorCode.INTERNAL, res.statusText || 'Request failed');
  }
}

function buildUrl(path: string, query: ApiFetchOptions['query']): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return `${API_PREFIX}${path}${qs ? `?${qs}` : ''}`;
}

function redirectToLogin(): void {
  const { pathname, search } = window.location;
  if (pathname.startsWith('/login')) return; // a failed login attempt is also a 401
  window.location.assign(`/login?next=${encodeURIComponent(pathname + search)}`);
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, query, clientMutationId, redirectOn401 = true } = options;
  const isMutation = method !== 'GET';
  const url = buildUrl(path, query);

  const send = async (): Promise<Response> => {
    const headers = new Headers({
      Accept: 'application/json',
      'Accept-Language': currentLanguage(),
    });
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (clientMutationId) headers.set('X-Client-Mutation-Id', clientMutationId);
    if (isMutation) headers.set('X-CSRF-Token', await loadCsrfToken());
    return fetch(url, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let res = await send();
  // The server answers CSRF failure and permission denial with the same 403 FORBIDDEN, so we
  // cannot tell them apart: on a 403 for a mutation, refresh the token and retry exactly once.
  // If the retry is also 403 it is a genuine permission error and is thrown below.
  if (res.status === 403 && isMutation) {
    csrfToken = undefined;
    res = await send();
  }

  if (!res.ok) {
    if (res.status === 401 && redirectOn401) redirectToLogin();
    throw await toApiError(res);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
