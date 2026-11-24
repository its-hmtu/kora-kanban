import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useMe, useResendVerification } from '../api';
import { failureMessage } from '../form-errors';

/**
 * Shown in the app shell while a password account's email is unverified (OAuth accounts are
 * always verified). Dismissal lasts until the next page load.
 */
export function VerifyEmailBanner() {
  const { t } = useTranslation('common');
  const { data: me } = useMe();
  const resend = useResendVerification();
  const [dismissed, setDismissed] = useState(false);

  if (!me || me.user.emailVerifiedAt || !me.user.hasPassword || dismissed) return null;
  return (
    <div
      data-testid="verify-email-banner"
      className="flex flex-wrap items-center gap-3 border-b bg-muted px-4 py-2 text-sm"
    >
      <span className="font-medium">{t('shell.verifyBanner.message')}</span>
      {resend.isSuccess ? (
        <span role="status">{t('shell.verifyBanner.sent')}</span>
      ) : (
        <Button
          variant="link"
          size="sm"
          disabled={resend.isPending}
          onClick={() => resend.mutate()}
        >
          {resend.isPending ? t('shell.verifyBanner.resending') : t('shell.verifyBanner.resend')}
        </Button>
      )}
      {resend.isError ? (
        <span role="alert" className="text-destructive">
          {failureMessage(resend.error, t)}
        </span>
      ) : null}
      <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setDismissed(true)}>
        {t('shell.verifyBanner.dismiss')}
      </Button>
    </div>
  );
}
