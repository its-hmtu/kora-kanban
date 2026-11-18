import { Controller, HttpCode, Inject, NotFoundException, Post } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Public } from '../../common/decorators/public.decorator';
import { APP_CONFIG } from '../../infra/config/config.module';
import type { Env } from '../../infra/config/env';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { REDIS } from '../../infra/redis/redis.module';
import { resetAppData } from './reset-app-data';

/**
 * Test-only: `POST /api/v1/__test/reset` wipes the database and Redis between Playwright e2e tests
 * (T046). Only mounted when NODE_ENV=test (see `TestResetModule` in AppModule); the handler checks
 * again so a wiring mistake can never expose it. Public, but CSRF-protected like any other POST.
 */
@Controller('__test')
export class TestResetController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: Env,
  ) {}

  @Public()
  @Post('reset')
  @HttpCode(204)
  async reset(): Promise<void> {
    if (this.config.NODE_ENV !== 'test') throw new NotFoundException();
    await resetAppData(this.prisma, this.redis);
  }
}
