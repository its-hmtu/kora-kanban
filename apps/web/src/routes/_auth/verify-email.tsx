import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AuthCard } from '@/features/auth/components/auth-card';
import { FormAlert } from '@/features/auth/components/form-alert';
import { useVerifyEmail } from '@/features/auth/api';
import { failureMessage, isTokenInvalid } from '@/features/auth/form-errors';

export const Route = createFileRoute('/_auth/verify-email')({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === 'string' && search.token ? { token: search.token } : {},
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { t } = useTranslation('auth');
  const { token } = Route.useSearch();
  const verify = useVerifyEmail();
  const started = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice; a token is single-use, so verify exactly once.
    if (!token || started.current) return;
    started.current = true;
    verify.mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const invalid = !token || (verify.isError && isTokenInvalid(verify.error));
  const failure = verify.isError && !invalid ? failureMessage(verify.error, t) : null;
  return (
    <AuthCard title={t('verifyEmail.title')} testId="verify-email-page">
      {invalid ? (
        <FormAlert message={t('verifyEmail.invalid')} />
      ) : failure ? (
        <FormAlert message={failure} />
      ) : verify.isSuccess ? (
        <div className="space-y-4">
          <p>{t('verifyEmail.success')}</p>
          <Button asChild className="w-full">
            <Link to="/">{t('verifyEmail.continue')}</Link>
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('verifyEmail.pending')}</p>
      )}
    </AuthCard>
  );
}
