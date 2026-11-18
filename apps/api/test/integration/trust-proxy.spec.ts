import { Controller, Get, Req } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { configureApp } from '../../src/app.setup';
import { loadEnv } from '../../src/infra/config/env';
import { closeHarness, getPrisma } from '../setup/test-app';

@Controller('t')
class IpController {
  @Get('ip')
  ip(@Req() req: Request) {
    return { ip: req.ip };
  }
}

let app: NestExpressApplication | undefined;

async function boot(trustProxy: string | undefined) {
  await getPrisma(); // sets the harness env
  const config = loadEnv({ ...process.env, TRUST_PROXY: trustProxy });
  const moduleRef = await Test.createTestingModule({ controllers: [IpController] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, config);
  await app.init();
  return request(app.getHttpServer());
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('TRUST_PROXY', () => {
  it('ignores X-Forwarded-For when 0/unset (spoofed headers cannot rotate buckets)', async () => {
    const res = await (
      await boot(undefined)
    )
      .get('/api/v1/t/ip')
      .set('X-Forwarded-For', '203.0.113.9');
    expect(res.body.ip).not.toBe('203.0.113.9');
    expect(res.body.ip).toMatch(/127\.0\.0\.1|::1/);
  });

  it('uses the last proxy hop of X-Forwarded-For when TRUST_PROXY=1', async () => {
    const res = await (
      await boot('1')
    )
      .get('/api/v1/t/ip')
      .set('X-Forwarded-For', '198.51.100.1, 203.0.113.9');
    expect(res.body.ip).toBe('203.0.113.9');
  });
});

afterAll(closeHarness);
