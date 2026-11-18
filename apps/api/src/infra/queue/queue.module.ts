import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { Env } from '../config/env';
import { QUEUE_NAMES, redisConnectionFromUrl } from './queues';

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
  exports: [BullModule],
})
export class QueueModule {}
