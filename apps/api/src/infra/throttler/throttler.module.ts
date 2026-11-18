import { Module, type ExecutionContext } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, type ThrottlerSkipIfFunction } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module';
import { KoraThrottlerGuard } from './throttler.guard';
import { USE_THROTTLER_KEY, type ThrottlerName } from './use-throttler.decorator';

const MINUTE_MS = 60_000;

const notRequested =
  (name: ThrottlerName): ThrottlerSkipIfFunction =>
  (context: ExecutionContext) => {
    const requested: ThrottlerName[] | undefined =
      (Reflect.getMetadata(USE_THROTTLER_KEY, context.getHandler()) as ThrottlerName[]) ??
      (Reflect.getMetadata(USE_THROTTLER_KEY, context.getClass()) as ThrottlerName[]);
    return !requested?.includes(name);
  };

interface TrackedRequest {
  ip?: string;
  body?: { email?: unknown };
  /** Set by the API-token auth (P4); until then `api-token` falls back to the client IP. */
  apiToken?: { id: string };
}

/** `auth` bucket: client IP + lowercased body email (IP alone when there is no email). */
export function authTracker(req: TrackedRequest): string {
  const email = req.body?.email;
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return `${req.ip ?? 'unknown'}|${normalized}`;
}

/** `auth-ip` bucket: client IP only, so rotating emails cannot dodge the cap. */
export function ipTracker(req: TrackedRequest): string {
  return req.ip ?? 'unknown';
}

/** `api-token` bucket: token id. Stub: falls back to the client IP until P4 introduces tokens. */
export function apiTokenTracker(req: TrackedRequest): string {
  return req.apiToken?.id ?? req.ip ?? 'unknown';
}

/**
 * Redis-backed rate limiting. The guard is global but every named throttler is skipped unless the
 * route opts in with `@AuthThrottle()` / `@ApiTokenThrottle()`, so default routes stay unthrottled.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        storage: new ThrottlerStorageRedisService(redis),
        throttlers: [
          {
            name: 'auth',
            ttl: MINUTE_MS,
            limit: 10,
            getTracker: authTracker,
            skipIf: notRequested('auth'),
          },
          {
            name: 'auth-ip',
            ttl: MINUTE_MS,
            limit: 30,
            getTracker: ipTracker,
            skipIf: notRequested('auth-ip'),
          },
          {
            name: 'api-token',
            ttl: MINUTE_MS,
            limit: 100,
            getTracker: apiTokenTracker,
            skipIf: notRequested('api-token'),
          },
        ],
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: KoraThrottlerGuard }],
})
export class KoraThrottlerModule {}
