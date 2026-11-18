import { Controller, Get, Post } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ErrorCode } from '@kora/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApp } from '../../src/app.setup';
import { ApiExceptionFilter } from '../../src/common/filters/api-exception.filter';
import { ConfigModule } from '../../src/infra/config/config.module';
import { RedisModule } from '../../src/infra/redis/redis.module';
import { KoraThrottlerModule } from '../../src/infra/throttler/throttler.module';
import { ApiTokenThrottle, AuthThrottle } from '../../src/infra/throttler/use-throttler.decorator';
import { closeHarness, getPrisma, resetDb } from '../setup/test-app';

@Controller('t')
class ProbeController {
  @Get('open')
  open() {
    return { ok: true };
  }

  @Post('login')
  @AuthThrottle()
  login() {
    return { ok: true };
  }

  @Get('token')
  @ApiTokenThrottle()
  token() {
    return { ok: true };
  }
}

let app: NestExpressApplication;

beforeAll(async () => {
  await getPrisma(); // sets the harness env (REDIS_URL etc.)
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, RedisModule, KoraThrottlerModule],
    controllers: [ProbeController],
    providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
  }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
});

beforeEach(resetDb);

afterAll(async () => {
  await app?.close();
  await closeHarness();
});

const login = (email: string) =>
  request(app.getHttpServer()).post('/api/v1/t/login').send({ email });

describe('rate limiting', () => {
  it('does not throttle routes that do not opt in', async () => {
    for (let i = 0; i < 120; i++) {
      await request(app.getHttpServer()).get('/api/v1/t/open').expect(200);
    }
  });

  it('allows 10 auth requests per minute per IP+email, then 429 RATE_LIMITED with Retry-After', async () => {
    for (let i = 0; i < 10; i++) await login('a@example.com').expect(201);
    const res = await login('a@example.com').expect(429);
    expect(res.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    const retryAfter = Number(res.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('keys auth by lowercased email: case variants share a bucket, other emails do not', async () => {
    for (let i = 0; i < 5; i++) await login('B@Example.com').expect(201);
    for (let i = 0; i < 5; i++) await login('b@example.com').expect(201);
    await login('b@EXAMPLE.com').expect(429);
    await login('other@example.com').expect(201);
  });

  it('caps auth at 30 requests per minute per IP regardless of email, then 429 with Retry-After', async () => {
    for (let i = 0; i < 30; i++) await login(`user${i}@example.com`).expect(201);
    const res = await login('user-new@example.com').expect(429);
    expect(res.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('still limits one email to 10 while the per-IP cap has room', async () => {
    for (let i = 0; i < 10; i++) await login('same@example.com').expect(201);
    await login('same@example.com').expect(429);
    await login('fresh@example.com').expect(201);
  });

  it('allows 100 api-token requests per minute, then 429 with Retry-After', async () => {
    for (let i = 0; i < 100; i++) {
      await request(app.getHttpServer()).get('/api/v1/t/token').expect(200);
    }
    const res = await request(app.getHttpServer()).get('/api/v1/t/token').expect(429);
    expect(res.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('keeps the auth and api-token buckets independent', async () => {
    for (let i = 0; i < 10; i++) await login('c@example.com').expect(201);
    await request(app.getHttpServer()).get('/api/v1/t/token').expect(200);
  });
});
