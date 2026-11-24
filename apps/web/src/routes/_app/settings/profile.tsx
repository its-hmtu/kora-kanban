import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/features/auth/api';
import { AccountActions } from '@/features/settings/account-actions';
import { PasswordForm } from '@/features/settings/password-form';
import { ProfileForm } from '@/features/settings/profile-form';

export const Route = createFileRoute('/_app/settings/profile')({
  component: ProfileSettingsPage,
});

function ProfileSettingsPage() {
  const { t } = useTranslation('settings');
  const { me: initial } = Route.useRouteContext();
  // Live data (the form saves update the cache); the route context only seeds the first render.
  const me = useMe().data ?? initial;
  const methods = [...(me.user.hasPassword ? ['password' as const] : []), ...me.providers];
  return (
    <div data-testid="profile-settings-page" className="mx-auto max-w-xl space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <ProfileForm me={me} />
      {me.user.hasPassword ? (
        <PasswordForm />
      ) : (
        <p className="text-sm text-muted-foreground">{t('password.notSetHint')}</p>
      )}
      <section className="space-y-4" aria-labelledby="methods-heading">
        <h2 id="methods-heading" className="text-lg font-semibold">
          {t('methods.title')}
        </h2>
        <ul aria-labelledby="methods-heading" className="list-inside list-disc text-sm">
          {methods.map((method) => (
            <li key={method}>{t(`methods.${method}`)}</li>
          ))}
        </ul>
      </section>
      <AccountActions />
    </div>
  );
}
