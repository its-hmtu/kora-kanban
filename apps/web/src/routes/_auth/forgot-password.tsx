import { zodResolver } from '@hookform/resolvers/zod';
import { forgotSchema, type ForgotInput } from '@kora/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AuthCard } from '@/features/auth/components/auth-card';
import { AuthField } from '@/features/auth/components/auth-field';
import { FormAlert } from '@/features/auth/components/form-alert';
import { useForgotPassword } from '@/features/auth/api';
import { applyApiError, fieldError } from '@/features/auth/form-errors';

export const Route = createFileRoute('/_auth/forgot-password')({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  const forgot = useForgotPassword();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ForgotInput>({ resolver: zodResolver(forgotSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await forgot.mutateAsync(values);
      setSent(true);
    } catch (err) {
      setFormError(applyApiError(err, t, setError));
    }
  });

  const back = (
    <p>
      <Link to="/login" className="underline">
        {t('forgot.backToLogin')}
      </Link>
    </p>
  );

  return (
    <AuthCard
      title={t('forgot.title')}
      description={sent ? undefined : t('forgot.description')}
      testId="forgot-password-page"
      footer={back}
    >
      {sent ? (
        <p role="status">{t('forgot.sent')}</p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormAlert message={formError} />
          <AuthField
            label={t('fields.email')}
            type="email"
            autoComplete="email"
            registration={register('email')}
            error={fieldError(t, 'email', errors.email)}
          />
          <Button type="submit" className="w-full" disabled={forgot.isPending}>
            {forgot.isPending ? t('forgot.submitting') : t('forgot.submit')}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
