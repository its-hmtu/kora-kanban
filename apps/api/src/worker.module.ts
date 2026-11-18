import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerParams } from './common/logging/logger.config';
import { ConfigModule } from './infra/config/config.module';
import { mailWorkerProviders } from './infra/mail/mail-worker.providers';
import { QueueModule } from './infra/queue/queue.module';

/**
 * Root module of the background worker process (no HTTP). Queue processors are registered here and
 * only here; later batches append their processors to `providers`.
 */
@Module({
  imports: [
    LoggerModule.forRoot(buildLoggerParams(process.env.NODE_ENV)),
    ConfigModule,
    QueueModule,
  ],
  providers: [...mailWorkerProviders],
})
export class WorkerModule {}
