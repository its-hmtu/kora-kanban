import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Post,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
  type LoggerService,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ErrorCode } from '@kora/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainError } from '../errors/domain-error';
import en from '../i18n/messages/en.json';
import { ApiExceptionFilter } from './api-exception.filter';

@Controller('boom')
class BoomController {
  @Get('domain')
  domain() {
    throw new DomainError(ErrorCode.WIP_LIMIT, 409, { limit: 3 });
  }
  @Get('unauth')
  unauth() {
    throw new UnauthorizedException();
  }
  @Get('forbidden')
  forbidden() {
    throw new ForbiddenException();
  }
  @Get('notfound')
  notFound() {
    throw new NotFoundException();
  }
  @Get('conflict')
  conflict() {
    throw new HttpException('conflict', 409);
  }
  @Get('large')
  large() {
    throw new PayloadTooLargeException();
  }
  @Get('unprocessable')
  unprocessable() {
    throw new HttpException('x', 422);
  }
  @Get('ratelimited')
  rateLimited() {
    throw new HttpException('x', 429);
  }
  @Get('bad')
  bad() {
    throw new BadRequestException();
  }
  @Get('teapot')
  teapot() {
    throw new HttpException('secret detail', 418);
  }
  @Post('body')
  body() {
    return { ok: true };
  }
  @Get('unknown')
  unknown() {
    throw new Error('db password is hunter2');
  }
}

describe('ApiExceptionFilter', () => {
  let app: NestExpressApplication;
  const errorLogs: unknown[][] = [];
  const logger: LoggerService = {
    log: () => undefined,
    warn: () => undefined,
    error: (...args: unknown[]) => void errorLogs.push(args),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [BoomController] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    app.useLogger(logger);
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });
  afterAll(() => app.close());

  const get = (path: string) => request(app.getHttpServer()).get(path);

  it('maps DomainError to its status, code and details', async () => {
    const res = await get('/boom/domain').expect(409);
    expect(res.body).toEqual({
      error: { code: 'WIP_LIMIT', message: en.WIP_LIMIT, details: { limit: 3 } },
    });
  });

  it.each([
    ['unauth', 401, 'UNAUTHENTICATED'],
    ['forbidden', 403, 'FORBIDDEN'],
    ['notfound', 404, 'NOT_FOUND'],
    ['conflict', 409, 'CONFLICT'],
    ['large', 413, 'PAYLOAD_TOO_LARGE'],
    ['unprocessable', 422, 'VALIDATION'],
    ['ratelimited', 429, 'RATE_LIMITED'],
    ['bad', 400, 'VALIDATION'],
  ])('maps HttpException %s to %i %s', async (path, status, code) => {
    const res = await get(`/boom/${path}`).expect(status);
    expect(res.body.error.code).toBe(code);
    expect(res.body.error.message).toBe(en[code as keyof typeof en]);
  });

  it('maps an unmapped HttpException status to INTERNAL keeping the status, without leaking', async () => {
    const res = await get('/boom/teapot').expect(418);
    expect(res.body).toEqual({ error: { code: 'INTERNAL', message: en.INTERNAL } });
    expect(JSON.stringify(res.body)).not.toContain('secret detail');
  });

  it('maps a malformed JSON body to 400 VALIDATION without parser internals', async () => {
    const res = await request(app.getHttpServer())
      .post('/boom/body')
      .set('Content-Type', 'application/json')
      .send('{bad json')
      .expect(400);
    expect(res.body).toEqual({ error: { code: 'VALIDATION', message: en.VALIDATION } });
  });

  it('maps a framework 404 for an unknown route to NOT_FOUND', async () => {
    const res = await get('/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns a generic 500 for unknown errors and logs the stack', async () => {
    errorLogs.length = 0;
    const res = await get('/boom/unknown').expect(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL', message: en.INTERNAL } });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(errorLogs).toHaveLength(1);
    expect(String(errorLogs[0]?.[0])).toContain('hunter2');
    expect(String(errorLogs[0]?.[1])).toContain('at ');
  });

  it('falls back to en for unsupported Accept-Language and honours supported tags', async () => {
    for (const header of ['fr-CA,fr;q=0.9', 'en-US,en;q=0.8', '*', 'garbage;;;']) {
      const res = await get('/boom/forbidden').set('Accept-Language', header).expect(403);
      expect(res.body.error.message).toBe(en.FORBIDDEN);
    }
  });
});

describe('en.json', () => {
  it('has a message for every ErrorCode (besides the email strings)', () => {
    const errorKeys = Object.keys(en).filter((key) => key !== 'email');
    expect(errorKeys.sort()).toEqual(Object.values(ErrorCode).sort());
  });
});
