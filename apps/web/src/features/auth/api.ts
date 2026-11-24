import type {
  ChangePasswordInput,
  ForgotInput,
  LoginInput,
  RegisterInput,
  ResetInput,
  UpdateMeInput,
  VerifyEmailInput,
} from '@kora/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, resetCsrfToken } from '@/lib/api-client';
import { fetchMe, meQueryKey, type Me, type MeUser } from '@/lib/me';

/** These mutations' errors are rendered by their forms, so the global error toast is skipped. */
const INLINE = { inlineErrors: true } as const;

/** `POST /auth/login` and `/auth/register` body. Use `useMe()` for the full profile. */
export interface SignInResponse {
  user: Pick<MeUser, 'id' | 'email' | 'name' | 'emailVerifiedAt'>;
}

export function useMe() {
  return useQuery({ queryKey: meQueryKey, queryFn: fetchMe });
}

/**
 * After a sign-in the server has rotated `kora_csrf`, so the cached token is dropped; `['me']` is
 * removed rather than invalidated because the `_app` guard's `ensureQueryData` ignores
 * invalidation and would keep serving the stale profile.
 */
function useSignInMutation<TInput>(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: INLINE,
    mutationFn: (input: TInput) =>
      apiFetch<SignInResponse>(path, { method: 'POST', body: input, redirectOn401: false }),
    onSuccess: () => {
      resetCsrfToken();
      queryClient.removeQueries({ queryKey: meQueryKey });
    },
  });
}

export const useLogin = () => useSignInMutation<LoginInput>('/auth/login');
export const useRegister = () => useSignInMutation<RegisterInput>('/auth/register');

/** Clears every cached query and the CSRF token. The caller navigates to /login. */
function useSignOutMutation(path: string, inlineErrors: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { inlineErrors },
    mutationFn: () => apiFetch<void>(path, { method: 'POST' }),
    onSuccess: () => {
      resetCsrfToken();
      queryClient.removeQueries();
    },
  });
}

export const useLogout = () => useSignOutMutation('/auth/logout', false);
export const useLogoutAll = () => useSignOutMutation('/auth/logout-all', true);

export function useForgotPassword() {
  return useMutation({
    meta: INLINE,
    mutationFn: (input: ForgotInput) =>
      apiFetch<void>('/auth/password/forgot', { method: 'POST', body: input }),
  });
}

/** Does not sign in: the caller sends the user to /login afterwards. */
export function useResetPassword() {
  return useMutation({
    meta: INLINE,
    mutationFn: (input: ResetInput) =>
      apiFetch<void>('/auth/password/reset', { method: 'POST', body: input }),
  });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: INLINE,
    mutationFn: (input: VerifyEmailInput) =>
      apiFetch<void>('/auth/verify-email', { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meQueryKey }),
  });
}

/** Emails a fresh verification link to the signed-in, unverified user. */
export function useResendVerification() {
  return useMutation({
    meta: INLINE,
    mutationFn: () => apiFetch<void>('/auth/verify-email/resend', { method: 'POST' }),
  });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: INLINE,
    mutationFn: (input: UpdateMeInput) => apiFetch<Me>('/me', { method: 'PATCH', body: input }),
    onSuccess: (me) => queryClient.setQueryData(meQueryKey, me),
  });
}

/** The server rotates the session and `kora_csrf`, so the cached token is dropped. */
export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: INLINE,
    mutationFn: (input: ChangePasswordInput) =>
      apiFetch<void>('/me/password', { method: 'PUT', body: input }),
    onSuccess: () => {
      resetCsrfToken();
      return queryClient.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}

/** Like sign-out: the account is gone, so drop every cached query and the CSRF token. */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: INLINE,
    mutationFn: () => apiFetch<void>('/me', { method: 'DELETE' }),
    onSuccess: () => {
      resetCsrfToken();
      queryClient.removeQueries();
    },
  });
}

export type OAuthProviderId = 'google' | 'github';

const PROVIDERS_STALE_MS = 10 * 60_000;

/** Providers the server has credentials for; the login/register pages show only these. */
export function useOAuthProviders() {
  return useQuery({
    queryKey: ['oauth-providers'],
    queryFn: async () =>
      (
        await apiFetch<{ providers: OAuthProviderId[] }>('/auth/oauth/providers', {
          redirectOn401: false,
        })
      ).providers,
    staleTime: PROVIDERS_STALE_MS,
    retry: false,
  });
}
