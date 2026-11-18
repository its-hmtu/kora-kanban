import { Controller, Get, Module, Res } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { LoggerModule } from 'nestjs-pino';
import type { Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildLoggerParams } from './logger.config';

@Controller('log')
class LogController {
  @Get()
  get() {
    return { ok: true };
  }

  @Get('cookie')
  cookie(@Res({ passthrough: true }) res: Response) {
    res.cookie('sid', 'secret-session-id');
    return { ok: true };
  }
}

const lines: string[] = [];
const stream = { write: (s: string) => void lines.push(s) };

@Module({
  imports: [LoggerModule.forRoot(buildLoggerParams('production', stream))],
  controllers: [LogController],
})
class LogModule {}

describe('structured logging', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [LogModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });
  afterAll(() => app.close());

  const lastLog = () => JSON.parse(lines[lines.length - 1] ?? '{}');

  it('logs JSON with the X-Request-Id header as request id and redacts sensitive headers', async () => {
    await request(app.getHttpServer())
      .get('/log')
      .set('X-Request-Id', 'req-123')
      .set('Cookie', 'sid=secret-cookie')
      .set('Authorization', 'Bearer secret-token')
      .set('X-CSRF-Token', 'secret-csrf')
      .expect(200);
    const log = lastLog();
    expect(log.req.id).toBe('req-123');
    expect(log.req.headers.cookie).toBe('[Redacted]');
    expect(log.req.headers.authorization).toBe('[Redacted]');
    expect(log.req.headers['x-csrf-token']).toBe('[Redacted]');
    expect(lines.join('')).not.toMatch(/secret-(cookie|token|csrf)/);
  });

  it('generates a request id when the header is absent', async () => {
    await request(app.getHttpServer()).get('/log').expect(200);
    expect(typeof lastLog().req.id).toBe('string');
    expect(lastLog().req.id.length).toBeGreaterThan(8);
  });

  it('redacts the Set-Cookie response header', async () => {
    await request(app.getHttpServer()).get('/log/cookie').expect(200);
    expect(lastLog().res.headers['set-cookie']).toBe('[Redacted]');
    expect(lines.join('')).not.toContain('secret-session-id');
  });

  it('is silent in the test environment', () => {
    expect(buildLoggerParams('test').pinoHttp).toMatchObject({ level: 'silent' });
  });
});
