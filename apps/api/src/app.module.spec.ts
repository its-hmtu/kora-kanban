import { Controller, Get, Module, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

@Controller('healthz')
class HealthController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}

@Controller('cookie-echo')
class CookieEchoController {
  @Get()
  echo(@Req() req: Request) {
    return { cookies: req.cookies };
  }
}

@Module({
  imports: [AppModule],
  controllers: [PingController, HealthController, CookieEchoController],
})
class TestAppModule {}

describe('AppModule bootstrap', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a JSON 404 for unknown routes under api/v1', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/unknown').expect(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.statusCode).toBe(404);
  });

  it('mounts routes under the api/v1 prefix only', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/ping').expect(200);
    expect(res.body).toEqual({ ok: true });
    await request(app.getHttpServer()).get('/ping').expect(404);
  });

  it('excludes /healthz from the prefix', async () => {
    await request(app.getHttpServer()).get('/healthz').expect(200);
    await request(app.getHttpServer()).get('/api/v1/healthz').expect(404);
  });

  it('parses cookies', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/cookie-echo')
      .set('Cookie', 'a=1')
      .expect(200);
    expect(res.body.cookies).toEqual({ a: '1' });
  });
});
