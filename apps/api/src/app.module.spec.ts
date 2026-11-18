import { Controller, Get, Req } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ErrorCode } from '@kora/shared';
import type { Request } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Public } from './common/decorators/public.decorator';
import { APP_CONFIG } from './infra/config/config.module';
import { closeHarness, createTestApp } from '../test/setup/test-app';

@Public()
@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

@Public()
@Controller('cookie-echo')
class CookieEchoController {
  @Get()
  echo(@Req() req: Request) {
    return { cookies: req.cookies };
  }
}

describe('AppModule bootstrap', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [PingController, CookieEchoController] });
  });

  afterAll(closeHarness);

  it('provides the validated APP_CONFIG (main.ts reads TRUST_PROXY from it)', () => {
    const config = app.get<{ TRUST_PROXY: number }>(APP_CONFIG);
    expect(config.TRUST_PROXY).toBe(0);
  });

  it('returns an ApiError 404 for unknown routes under api/v1', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/unknown').expect(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toEqual({ error: { code: ErrorCode.NOT_FOUND, message: expect.any(String) } });
  });

  it('mounts routes under the api/v1 prefix only', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/ping').expect(200);
    expect(res.body).toEqual({ ok: true });
    await request(app.getHttpServer()).get('/ping').expect(404);
  });

  it('parses cookies', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/cookie-echo')
      .set('Cookie', 'a=1')
      .expect(200);
    expect(res.body.cookies).toEqual({ a: '1' });
  });
});
