import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AccessModule } from './common/access/access.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { CsrfGuard } from './common/guards/csrf.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { SessionAuthGuard } from './common/guards/session-auth.guard';
import { buildLoggerParams } from './common/logging/logger.config';
import { APP_CONFIG, ConfigModule } from './infra/config/config.module';
import type { Env } from './infra/config/env';
import { CryptoModule } from './infra/crypto/crypto.module';
import { MailModule } from './infra/mail/mail.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { QueueModule } from './infra/queue/queue.module';
import { RedisModule } from './infra/redis/redis.module';
import { KoraThrottlerModule } from './infra/throttler/throttler.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { TestResetModule } from './modules/health/test-reset.module';

/**
 * Test-only modules (`POST /api/v1/__test/reset` for e2e). Decided when this file is first
 * evaluated, from the raw NODE_ENV: entrypoints import `load-env` before AppModule, so `.env` is
 * already applied, and an unset NODE_ENV (config default `development`) leaves them out. Outside
 * NODE_ENV=test the routes are never registered at all.
 */
const TEST_ONLY_MODULES = process.env.NODE_ENV === 'test' ? [TestResetModule] : [];

/**
 * Global guards run in registration order: SessionAuthGuard → CsrfGuard → PermissionGuard (the
 * APP_GUARDs below). Nest registers AppModule's own APP_GUARDs before those of imported modules,
 * so KoraThrottlerModule's guard runs last: requests rejected by auth/CSRF/permissions never spend
 * rate-limit budget, and the `api-token` tracker can read the token identity auth attached.
 */
@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: Env) => buildLoggerParams(config.NODE_ENV),
    }),
    PrismaModule,
    RedisModule,
    CryptoModule,
    QueueModule,
    MailModule,
    KoraThrottlerModule,
    AccessModule,
    AuthModule,
    HealthModule,
    ...TEST_ONLY_MODULES,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
