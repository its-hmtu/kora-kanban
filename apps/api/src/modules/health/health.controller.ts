import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, Header, Inject, Res } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { REDIS } from '../../infra/redis/redis.module';
import { EMAIL_QUEUE } from '../../infra/mail/mail.types';

/** A dependency that hasn't answered within this window counts as down (clients retry forever). */
export const HEALTH_CHECK_TIMEOUT_MS = 2_000;

type CheckStatus = 'ok' | 'error';
export interface HealthResponse {
  status: CheckStatus;
  checks: { db: CheckStatus; redis: CheckStatus; queue: CheckStatus };
}

async function check(probe: () => Promise<unknown>): Promise<CheckStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), HEALTH_CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([probe(), timeout]);
    return 'ok';
  } catch {
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}

/** Liveness/readiness probe for load balancers: 200 when every dependency answers, else 503. */
@Controller('healthz')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(EMAIL_QUEUE) private readonly queue: Queue,
  ) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  async health(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const [db, redis, queue] = await Promise.all([
      check(() => this.prisma.client.$queryRaw`SELECT 1`),
      check(() => this.redis.ping()),
      // BullMQ has its own connection; round-trip a cheap command (CLIENT INFO) over it.
      check(async () => (await this.queue.getBackend().client).clientInfo()),
    ]);
    const checks = { db, redis, queue };
    const ok = Object.values(checks).every((c) => c === 'ok');
    res.status(ok ? 200 : 503);
    return { status: ok ? 'ok' : 'error', checks };
  }
}
