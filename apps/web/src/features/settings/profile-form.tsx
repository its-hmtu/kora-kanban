import { zodResolver } from '@hookform/resolvers/zod';
import { LOCALES, updateMeSchema, type Locale, type UpdateMeInput } from '@kora/shared';
import { useMemo, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/theme-provider';
import { AuthField } from '@/features/auth/components/auth-field';
import { FormAlert } from '@/features/auth/components/form-alert';
import { useUpdateMe } from '@/features/auth/api';
import { applyApiError, fieldError } from '@/features/auth/form-errors';
import type { Me, MeUser } from '@/lib/me';
import { SelectField } from './native-select';

// US16 enables the other languages.
const ENABLED_LOCALES: readonly Locale[] = ['en'];

interface ProfileValues {
  name: string;
  avatarUrl: string;
  locale: Locale;
  timezone: string;
}

const toValues = (user: MeUser): ProfileValues => ({
  name: user.name,
  avatarUrl: user.avatarUrl ?? '',
  locale: user.locale,
  timezone: user.timezone,
});

/** The browser's IANA zones plus `UTC` and the saved value, which the list may omit. */
function timeZoneOptions(current: string): string[] {
  const zones = new Set<string>(Intl.supportedValuesOf('timeZone'));
  zones.add('UTC');
  zones.add(current);
  return [...zones].sort();
}

// The form holds an empty string for "no avatar"; the API wants null.
const resolver: Resolver<ProfileValues> = (values, context, options) =>
  zodResolver(updateMeSchema)(
    { ...values, avatarUrl: values.avatarUrl.trim() || null },
    context,
    options as never,
  ) as never;

export function ProfileForm({ me }: { me: Me }) {
  const { t } = useTranslation('settings');
  const { setTheme } = useTheme();
  const update = useUpdateMe();
  const [formError, setFormError] = useState<string | null>(null);
  const zones = useMemo(() => timeZoneOptions(me.user.timezone), [me.user.timezone]);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<ProfileValues>({ defaultValues: toValues(me.user), resolver });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      // The resolver already turned an empty `avatarUrl` into null, which the form type can't say.
      const saved = await update.mutateAsync(values as unknown as UpdateMeInput);
      reset(toValues(saved.user));
      toast.success(t('profile.saved'));
    } catch (err) {
      setFormError(applyApiError(err, t, setError));
    }
  });

  const onThemeChange = (theme: MeUser['theme']) => {
    setTheme(theme);
    update.mutate({ theme });
  };

  return (
    <section className="space-y-4" aria-labelledby="profile-heading">
      <h2 id="profile-heading" className="text-lg font-semibold">
        {t('profile.title')}
      </h2>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <AuthField
          label={t('profile.name')}
          autoComplete="name"
          registration={register('name')}
          error={fieldError(t, 'name', errors.name)}
        />
        <AuthField
          label={t('profile.avatarUrl')}
          registration={register('avatarUrl')}
          error={errors.avatarUrl ? t('profile.avatarInvalid') : undefined}
        />
        <SelectField label={t('profile.language')} {...register('locale')}>
          {LOCALES.map((locale) => (
            <option key={locale} value={locale} disabled={!ENABLED_LOCALES.includes(locale)}>
              {ENABLED_LOCALES.includes(locale)
                ? t(`languages.${locale}`)
                : `${t(`languages.${locale}`)} (${t('profile.comingSoon')})`}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('profile.timezone')} {...register('timezone')}>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </SelectField>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? t('profile.saving') : t('profile.save')}
        </Button>
      </form>
      <SelectField
        label={t('profile.theme')}
        value={me.user.theme}
        onChange={(event) => onThemeChange(event.target.value as MeUser['theme'])}
      >
        {(['system', 'light', 'dark'] as const).map((theme) => (
          <option key={theme} value={theme}>
            {t(`themes.${theme}`)}
          </option>
        ))}
      </SelectField>
    </section>
  );
}
