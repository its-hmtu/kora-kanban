import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { Env } from './infra/config/env';

export function configureApp(app: NestExpressApplication, config?: Pick<Env, 'TRUST_PROXY'>): void {
  // Only trust X-Forwarded-For behind a known number of proxies; otherwise clients could spoof
  // their IP and rotate rate-limit buckets.
  if (config && config.TRUST_PROXY > 0) app.set('trust proxy', config.TRUST_PROXY);
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1', { exclude: ['healthz'] });
}
