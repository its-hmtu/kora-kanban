import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@kora/shared';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AuthCard } from '@/features/auth/components/auth-card';
import { AuthField } from '@/features/auth/components/auth-field';
import { FormAlert } from '@/features/auth/components/form-alert';
import { OAuthButtons } from '@/features/auth/components/oauth-buttons';
import { useRegister } from '@/features/auth/api';
import { applyApiError, fieldError } from '@/features/auth/form-errors';

export const Route = createFileRoute('/_auth/register')({
  component: RegisterPage,
});

function RegisterPage() {
  const { t } = useTranslation('auth');
  const router = useRouter();
  const registerUser = useRegister();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await registerUser.mutateAsync(values);
      // Registering signs the user in.
      router.history.push('/');
    } catch (err) {
      setFormError(applyApiError(err, t, setError));
    }
  });

  return (
    <AuthCard
      title={t('register.title')}
      description={t('register.description')}
      testId="register-page"
      footer={
        <p>
          {t('register.loginPrompt')}{' '}
          <Link to="/login" className="underline">
            {t('register.loginLink')}
          </Link>
        </p>
      }
    >
      <OAuthButtons />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <AuthField
          label={t('fields.name')}
          autoComplete="name"
          registration={register('name')}
          error={fieldError(t, 'name', errors.name)}
        />
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
          autoComplete="new-password"
          registration={register('password')}
          error={fieldError(t, 'newPassword', errors.password)}
        />
        <Button type="submit" className="w-full" disabled={registerUser.isPending}>
          {registerUser.isPending ? t('register.submitting') : t('register.submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
