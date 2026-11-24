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
function useSignOutMutation(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>(path, { method: 'POST' }),
    onSuccess: () => {
      resetCsrfToken();
      queryClient.removeQueries();
    },
  });
}

export const useLogout = () => useSignOutMutation('/auth/logout');
export const useLogoutAll = () => useSignOutMutation('/auth/logout-all');

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: ForgotInput) =>
      apiFetch<void>('/auth/password/forgot', { method: 'POST', body: input }),
  });
}

/** Does not sign in: the caller sends the user to /login afterwards. */
export function useResetPassword() {
  return useMutation({
    mutationFn: (input: ResetInput) =>
      apiFetch<void>('/auth/password/reset', { method: 'POST', body: input }),
  });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VerifyEmailInput) =>
      apiFetch<void>('/auth/verify-email', { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meQueryKey }),
  });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMeInput) => apiFetch<Me>('/me', { method: 'PATCH', body: input }),
    onSuccess: (me) => queryClient.setQueryData(meQueryKey, me),
  });
}

/** The server rotates the session and `kora_csrf`, so the cached token is dropped. */
export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      apiFetch<void>('/me/password', { method: 'PUT', body: input }),
    onSuccess: () => {
      resetCsrfToken();
      return queryClient.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}
