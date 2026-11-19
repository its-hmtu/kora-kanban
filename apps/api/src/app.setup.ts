import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { Env } from './infra/config/env';

/** Explicit body-size cap (the Express default, stated so it is a decision rather than an accident). */
export const BODY_LIMIT = '100kb';

export function configureApp(app: NestExpressApplication, config?: Pick<Env, 'TRUST_PROXY'>): void {
  // Only trust X-Forwarded-For behind a known number of proxies; otherwise clients could spoof
  // their IP and rotate rate-limit buckets.
  if (config && config.TRUST_PROXY > 0) app.set('trust proxy', config.TRUST_PROXY);
  app.useBodyParser('json', { limit: BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: BODY_LIMIT, extended: true });
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1', { exclude: ['healthz'] });
}
