import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@kora/shared';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AuthCard } from '@/features/auth/components/auth-card';
import { AuthField } from '@/features/auth/components/auth-field';
import { FormAlert } from '@/features/auth/components/form-alert';
import { OAuthButtons } from '@/features/auth/components/oauth-buttons';
import { useLogin } from '@/features/auth/api';
import { applyApiError, fieldError } from '@/features/auth/form-errors';
import { safeNext } from '@/lib/safe-next';

const OAUTH_ERRORS = ['oauth_failed', 'oauth_email_unverified'] as const;
type OAuthError = (typeof OAUTH_ERRORS)[number];

export const Route = createFileRoute('/_auth/login')({
  // Only a same-origin path survives; sign-in redirects there.
  validateSearch: (search: Record<string, unknown>): { next?: string; error?: OAuthError } => ({
    ...(typeof search.next === 'string' ? { next: safeNext(search.next) } : {}),
    ...(OAUTH_ERRORS.includes(search.error as OAuthError)
      ? { error: search.error as OAuthError }
      : {}),
  }),
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation('auth');
  const { next, error: oauthError } = Route.useSearch();
  const router = useRouter();
  const login = useLogin();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login.mutateAsync(values);
      router.history.push(safeNext(next));
    } catch (err) {
      setFormError(
        applyApiError(err, t, setError, { unauthenticated: t('errors.invalidCredentials') }),
      );
    }
  });

  const alert =
    formError ??
    (oauthError === 'oauth_failed' ? t('errors.oauth_failed') : undefined) ??
    (oauthError === 'oauth_email_unverified' ? t('errors.oauth_email_unverified') : undefined);

  return (
    <AuthCard
      title={t('login.title')}
      description={t('login.description')}
      testId="login-page"
      footer={
        <>
          <p>
            <Link to="/forgot-password" className="underline">
              {t('login.forgotLink')}
            </Link>
          </p>
          <p>
            {t('login.registerPrompt')}{' '}
            <Link to="/register" className="underline">
              {t('login.registerLink')}
            </Link>
          </p>
        </>
      }
    >
      <OAuthButtons next={next} />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={alert} />
        <AuthField
          label={t('fields.email')}
          type="email"
          autoComplete="email"
          registration={register('email')}
          error={fieldError(t, 'email', errors.email)}
        />
        <AuthField
          label={t('fields.password')}
          type="password"
          autoComplete="current-password"
          registration={register('password')}
          error={fieldError(t, 'password', errors.password)}
        />
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? t('login.submitting') : t('login.submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
