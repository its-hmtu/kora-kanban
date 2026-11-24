import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useOAuthProviders } from '@/features/auth/api';
import { safeNext } from '@/lib/safe-next';

/**
 * Full-page navigation to the API's OAuth start route (not a fetch). Only providers the server
 * has configured are shown; with none (or while loading/failing) nothing renders, divider included.
 */
export function OAuthButtons({ next }: { next?: string }) {
  const { t } = useTranslation('auth');
  const { data: providers } = useOAuthProviders();
  if (!providers?.length) return null;
  return (
    <div className="space-y-2">
      {providers.map((provider) => (
        <Button key={provider} asChild variant="outline" className="w-full">
          <a href={`/api/v1/auth/oauth/${provider}?next=${encodeURIComponent(safeNext(next))}`}>
            {t(`oauth.${provider}`)}
          </a>
        </Button>
      ))}
      <p className="text-center text-xs text-muted-foreground">{t('oauth.divider')}</p>
    </div>
  );
}
