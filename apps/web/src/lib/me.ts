import type { Locale } from '@kora/shared';
import { apiFetch } from './api-client';

/** The signed-in user's profile in `GET /me`. Never contains secrets. */
export interface MeUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  locale: Locale;
  theme: 'light' | 'dark' | 'system';
  timezone: string;
  /** ISO timestamp, or null while the email is unverified (the web shows a banner). */
  emailVerifiedAt: string | null;
  /** False for OAuth-only accounts, which cannot change a password they do not have. */
  hasPassword: boolean;
}

/** `GET /me` (and `PATCH /me`) response. `workspaces` is filled in by US2. */
export interface Me {
  user: MeUser;
  providers: ('google' | 'github')[];
  workspaces: never[];
}

export const meQueryKey = ['me'] as const;

/** Probe: a 401 must reach the route guard, not trigger the client's own redirect. */
export const fetchMe = () => apiFetch<Me>('/me', { redirectOn401: false });
