import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

describe('AppModule bootstrap', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots and returns a JSON 404 under the api/v1 prefix', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/unknown').expect(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.statusCode).toBe(404);
  });

  it('does not mount routes without the prefix', async () => {
    await request(app.getHttpServer()).get('/unknown').expect(404);
  });
});
