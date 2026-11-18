import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Global, Injectable, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { APP_CONFIG } from '../config/config.module';
import type { Env } from '../config/env';
import { QUEUE_NAMES, redisConnectionFromUrl } from './queues';

/**
 * A BullMQ queue without an `error` listener prints every connection error with console.error;
 * route them through the app logger instead.
 */
@Injectable()
class QueueErrorLogger implements OnModuleInit {
  private readonly logger = new Logger('BullMQ');

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    for (const name of QUEUE_NAMES) {
      this.moduleRef
        .get<Queue>(getQueueToken(name), { strict: false })
        .on('error', (err: Error) => this.logger.error(`Queue "${name}" error: ${err.message}`));
    }
  }
}

/** BullMQ connection + every queue in `QUEUE_NAMES`. Inject with `@InjectQueue(name)`. */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: Env) => ({ connection: redisConnectionFromUrl(config.REDIS_URL) }),
    }),
    BullModule.registerQueue(...QUEUE_NAMES.map((name) => ({ name }))),
  ],
  providers: [QueueErrorLogger],
  exports: [BullModule],
})
export class QueueModule {}
