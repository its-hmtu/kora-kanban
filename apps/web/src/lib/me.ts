import type { Locale } from '@kora/shared';
import { apiFetch } from './api-client';

/** `GET /me` response (matches the API's `AuthUser`); the shared Zod schema arrives with US1. */
export interface Me {
  id: string;
  email: string;
  name: string;
  locale: Locale;
  theme: 'light' | 'dark' | 'system';
  timezone: string;
}

export const meQueryKey = ['me'] as const;

/** Probe: a 401 must reach the route guard, not trigger the client's own redirect. */
export const fetchMe = () => apiFetch<Me>('/me', { redirectOn401: false });
