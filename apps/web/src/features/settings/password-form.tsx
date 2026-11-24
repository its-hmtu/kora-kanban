import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema } from '@kora/shared';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AuthField } from '@/features/auth/components/auth-field';
import { FormAlert } from '@/features/auth/components/form-alert';
import { useChangePassword } from '@/features/auth/api';
import { applyApiError, fieldError } from '@/features/auth/form-errors';

interface PasswordValues {
  currentPassword: string;
  newPassword: string;
  confirm: string;
}

export function PasswordForm() {
  const { t } = useTranslation('settings');
  const change = useChangePassword();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    reset,
    formState: { errors },
  } = useForm<PasswordValues>({
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
    resolver: zodResolver(changePasswordSchema) as unknown as Resolver<PasswordValues>,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    // The resolver strips `confirm` (not in the shared schema), so read it from the form.
    if (values.newPassword !== getValues('confirm')) {
      setError('confirm', { type: 'mismatch', message: t('auth:validation.passwordMismatch') });
      return;
    }
    try {
      await change.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      reset();
      toast.success(t('password.changed'));
    } catch (err) {
      setFormError(applyApiError(err, t, setError));
    }
  });

  return (
    <section className="space-y-4" aria-labelledby="password-heading">
      <h2 id="password-heading" className="text-lg font-semibold">
        {t('password.title')}
      </h2>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <AuthField
          label={t('password.current')}
          type="password"
          autoComplete="current-password"
          registration={register('currentPassword')}
          error={fieldError(t, 'currentPassword', errors.currentPassword)}
        />
        <AuthField
          label={t('password.new')}
          type="password"
          autoComplete="new-password"
          registration={register('newPassword')}
          error={fieldError(t, 'newPassword', errors.newPassword)}
        />
        <AuthField
          label={t('password.confirm')}
          type="password"
          autoComplete="new-password"
          registration={register('confirm')}
          error={fieldError(t, 'confirm', errors.confirm)}
        />
        <Button type="submit" disabled={change.isPending}>
          {change.isPending ? t('password.submitting') : t('password.submit')}
        </Button>
      </form>
    </section>
  );
}
