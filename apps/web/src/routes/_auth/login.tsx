import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { safeNext } from '@/lib/safe-next';

export const Route = createFileRoute('/_auth/login')({
  // Only a same-origin path survives; the real form (US1) redirects there after sign-in.
  validateSearch: (search: Record<string, unknown>): { next?: string } =>
    typeof search.next === 'string' ? { next: safeNext(search.next) } : {},
  component: LoginPage,
});

// Placeholder page: the sign-in form arrives with US1.
function LoginPage() {
  const { t } = useTranslation('auth');
  return <h1 data-testid="login-page">{t('login.title')}</h1>;
}
