import { SetMetadata } from '@nestjs/common';

export const SKIP_CSRF_KEY = 'kora:skipCsrf';

/**
 * Exempts a route (or controller) from `CsrfGuard`. Only for signature-verified inbound webhooks
 * (`/hooks/*`, research B3) — never for routes a browser session can reach.
 */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);
