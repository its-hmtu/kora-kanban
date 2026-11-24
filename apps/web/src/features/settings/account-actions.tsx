import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useDeleteAccount, useLogoutAll } from '@/features/auth/api';
import { failureMessage } from '@/features/auth/form-errors';

type Action = 'signOutAll' | 'delete';

/** A destructive action behind a confirm dialog; goes to /login once the server accepts it. */
function ConfirmAction({
  action,
  run,
  destructive,
}: {
  action: Action;
  run: () => Promise<unknown>;
  destructive?: boolean;
}) {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await run();
      await navigate({ to: '/login' });
    } catch (err) {
      setError(failureMessage(err, t));
      setPending(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant={destructive ? 'destructive' : 'outline'}>
          {t(`account.${action}.button`)}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(`account.${action}.title`)}</AlertDialogTitle>
          <AlertDialogDescription>{t(`account.${action}.description`)}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t('account.cancel')}</AlertDialogCancel>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending}
            onClick={() => void confirm()}
          >
            {pending ? t('account.working') : t(`account.${action}.confirm`)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AccountActions() {
  const { t } = useTranslation('settings');
  const logoutAll = useLogoutAll();
  const deleteAccount = useDeleteAccount();
  return (
    <section className="space-y-4" aria-labelledby="account-heading">
      <h2 id="account-heading" className="text-lg font-semibold">
        {t('account.title')}
      </h2>
      <div className="flex flex-wrap gap-3">
        <ConfirmAction action="signOutAll" run={() => logoutAll.mutateAsync()} />
        <ConfirmAction action="delete" run={() => deleteAccount.mutateAsync()} destructive />
      </div>
    </section>
  );
}
