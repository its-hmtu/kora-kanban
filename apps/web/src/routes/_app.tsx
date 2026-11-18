import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
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
        <span className="text-muted-foreground text-sm">{me.name}</span>
      </header>
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
