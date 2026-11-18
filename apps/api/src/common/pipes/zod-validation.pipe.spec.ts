import { Controller, Get, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiExceptionFilter } from '../filters/api-exception.filter';
import { ZodBody, ZodQuery } from './zod-validation.pipe';

const bodySchema = z.object({ title: z.string().min(1), count: z.number().int().default(1) });
const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(10).default(5) });

@Controller('zod')
class ZodController {
  @Post()
  create(@ZodBody(bodySchema) body: z.infer<typeof bodySchema>) {
    return body;
  }

  @Get()
  list(@ZodQuery(querySchema) query: z.infer<typeof querySchema>) {
    return query;
  }
}

describe('ZodValidationPipe via @ZodBody / @ZodQuery', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [ZodController] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });
  afterAll(() => app.close());

  it('passes the parsed (defaulted, coerced) value to the handler', async () => {
    const body = await request(app.getHttpServer()).post('/zod').send({ title: 'a' }).expect(201);
    expect(body.body).toEqual({ title: 'a', count: 1 });
    const q = await request(app.getHttpServer()).get('/zod?limit=3').expect(200);
    expect(q.body).toEqual({ limit: 3 });
  });

  it('responds 422 VALIDATION with the flattened zod error for a bad body', async () => {
    const res = await request(app.getHttpServer()).post('/zod').send({ title: '' }).expect(422);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(typeof res.body.error.message).toBe('string');
    expect(res.body.error.details.fieldErrors.title).toHaveLength(1);
    expect(res.body.error.details.formErrors).toEqual([]);
  });

  it('responds 422 VALIDATION for a bad query', async () => {
    const res = await request(app.getHttpServer()).get('/zod?limit=99').expect(422);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.details.fieldErrors.limit).toBeDefined();
  });
});
