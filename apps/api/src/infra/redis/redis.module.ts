import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { APP_CONFIG } from '../config/config.module';
import type { Env } from '../config/env';

export const REDIS = 'REDIS';

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [APP_CONFIG],
      useFactory: (config: Env) => {
        const redis = new Redis(config.REDIS_URL);
        // Without a listener ioredis prints "Unhandled error event" on every failed reconnect.
        const logger = new Logger('Redis');
        redis.on('error', (err: Error) => logger.error(`Redis connection error: ${err.message}`));
        return redis;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    // QUIT is queued until the connection is up; when Redis is unreachable just drop the socket.
    if (this.redis.status === 'ready') await this.redis.quit();
    else this.redis.disconnect();
  }
}
