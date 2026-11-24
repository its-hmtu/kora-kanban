import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/features/auth/api';
import { VerifyEmailBanner } from '@/features/auth/components/verify-email-banner';
import { ApiError } from '@/lib/api-client';
import { fetchMe, meQueryKey } from '@/lib/me';
import { queryClient } from '@/lib/query-client';
import { safeNext } from '@/lib/safe-next';

// Authenticated layout: every child route requires a valid session.
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ location }) => {
    try {
      const me = await queryClient.ensureQueryData({
        queryKey: meQueryKey,
        queryFn: fetchMe,
        staleTime: 60_000,
      });
      return { me };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        queryClient.removeQueries({ queryKey: meQueryKey });
        throw redirect({ to: '/login', search: { next: safeNext(location.href) } });
      }
      throw error;
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const { t } = useTranslation('common');
  const { me } = Route.useRouteContext();
  return (
    <div className="flex min-h-screen flex-col">
      <header
        data-testid="top-bar"
        className="flex h-14 items-center justify-between border-b px-4"
      >
        <span className="font-semibold">{t('app.name')}</span>
        <div className="flex items-center gap-3">
          <Link
            to="/settings/profile"
            title={t('shell.profileLink')}
            className="text-muted-foreground text-sm hover:underline"
          >
            {me.user.name}
          </Link>
          <SignOutButton />
        </div>
      </header>
      <VerifyEmailBanner />
      <div className="flex flex-1">
        <aside data-testid="sidebar" className="text-muted-foreground w-60 border-r p-4 text-sm">
          {t('shell.sidebarPlaceholder')}
        </aside>
        <main className="flex-1 p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Signs out this device only; a failure stays here (the mutation cache shows the error toast). */
function SignOutButton() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const logout = useLogout();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={logout.isPending}
      onClick={() => logout.mutate(undefined, { onSuccess: () => void navigate({ to: '/login' }) })}
    >
      {t('shell.signOut')}
    </Button>
  );
}
