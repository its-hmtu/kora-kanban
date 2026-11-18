import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerParams } from './common/logging/logger.config';
import { APP_CONFIG, ConfigModule } from './infra/config/config.module';
import type { Env } from './infra/config/env';
import { mailWorkerProviders } from './infra/mail/mail-worker.providers';
import { QueueModule } from './infra/queue/queue.module';

/**
 * Root module of the background worker process (no HTTP). Queue processors are registered here and
 * only here; later batches append their processors to `providers`.
 */
@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: Env) => buildLoggerParams(config.NODE_ENV),
    }),
    QueueModule,
  ],
  providers: [...mailWorkerProviders],
})
export class WorkerModule {}
