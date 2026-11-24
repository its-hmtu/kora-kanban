import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { safeNext } from '@/lib/safe-next';

/** Full-page navigation to the API's OAuth start route (not a fetch). */
export function OAuthButtons({ next }: { next?: string }) {
  const { t } = useTranslation('auth');
  const href = (provider: 'google' | 'github') =>
    `/api/v1/auth/oauth/${provider}?next=${encodeURIComponent(safeNext(next))}`;
  return (
    <div className="space-y-2">
      <Button asChild variant="outline" className="w-full">
        <a href={href('google')}>{t('oauth.google')}</a>
      </Button>
      <Button asChild variant="outline" className="w-full">
        <a href={href('github')}>{t('oauth.github')}</a>
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t('oauth.divider')}</p>
    </div>
  );
}
