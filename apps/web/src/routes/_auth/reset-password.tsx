import { zodResolver } from '@hookform/resolvers/zod';
import { resetSchema } from '@kora/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AuthCard } from '@/features/auth/components/auth-card';
import { AuthField } from '@/features/auth/components/auth-field';
import { FormAlert } from '@/features/auth/components/form-alert';
import { useResetPassword } from '@/features/auth/api';
import { applyApiError, isTokenInvalid, fieldError } from '@/features/auth/form-errors';

export const Route = createFileRoute('/_auth/reset-password')({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === 'string' && search.token ? { token: search.token } : {},
  component: ResetPasswordPage,
});

interface ResetForm {
  password: string;
  confirm: string;
}

function ResetPasswordPage() {
  const { t } = useTranslation('auth');
  const { token } = Route.useSearch();
  const reset = useResetPassword();
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors },
  } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema.pick({ password: true })) as unknown as Resolver<ResetForm>,
  });

  const requestNew = (
    <p>
      <Link to="/forgot-password" className="underline">
        {t('reset.requestNew')}
      </Link>
    </p>
  );

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    // The resolver strips `confirm` (not in the shared schema), so read it from the form.
    if (values.password !== getValues('confirm')) {
      setError('confirm', { type: 'mismatch', message: t('validation.passwordMismatch') });
      return;
    }
    try {
      await reset.mutateAsync({ token: token ?? '', password: values.password });
      setDone(true);
    } catch (err) {
      setFormError(
        isTokenInvalid(err) ? t('errors.tokenInvalid') : applyApiError(err, t, setError),
      );
    }
  });

  if (!token) {
    return (
      <AuthCard title={t('reset.title')} testId="reset-password-page" footer={requestNew}>
        <FormAlert message={t('reset.missingToken')} />
      </AuthCard>
    );
  }
  if (done) {
    return (
      <AuthCard title={t('reset.title')} testId="reset-password-page">
        <div className="space-y-4">
          <p role="status">{t('reset.success')}</p>
          <Button asChild className="w-full">
            <Link to="/login">{t('reset.goToLogin')}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title={t('reset.title')}
      description={t('reset.description')}
      testId="reset-password-page"
      footer={formError === t('errors.tokenInvalid') ? requestNew : undefined}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <AuthField
          label={t('fields.newPassword')}
          type="password"
          autoComplete="new-password"
          registration={register('password')}
          error={fieldError(t, 'password', errors.password)}
        />
        <AuthField
          label={t('fields.confirmPassword')}
          type="password"
          autoComplete="new-password"
          registration={register('confirm')}
          error={fieldError(t, 'confirm', errors.confirm)}
        />
        <Button type="submit" className="w-full" disabled={reset.isPending}>
          {reset.isPending ? t('reset.submitting') : t('reset.submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
