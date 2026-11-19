import { ErrorCode } from '@kora/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import en from '../../src/common/i18n/messages/en.json';
import { closeHarness, createTestApp } from '../setup/test-app';

let app: NestExpressApplication;

beforeAll(async () => {
  app = await createTestApp();
});
afterAll(closeHarness);

describe('body-parser errors', () => {
  it('maps an oversized JSON body to 413 PAYLOAD_TOO_LARGE without leaking details', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/csrf')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(200 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: { code: ErrorCode.PAYLOAD_TOO_LARGE, message: en[ErrorCode.PAYLOAD_TOO_LARGE] },
    });
  });

  it('maps a non-UTF-8 charset to 415 and preserves the status', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/csrf')
      .set('Content-Type', 'application/json; charset=iso-8859-1')
      .send('{}');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe(ErrorCode.INTERNAL);
    expect(res.body.error.message).toBe(en[ErrorCode.INTERNAL]);
  });

  it('still maps malformed JSON to 400 VALIDATION', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/csrf')
      .set('Content-Type', 'application/json')
      .send('{nope');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION);
  });
});
