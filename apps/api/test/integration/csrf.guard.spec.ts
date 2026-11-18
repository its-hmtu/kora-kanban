import { Controller, Delete, Get, Patch, Post, Put } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ErrorCode } from '@kora/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApp } from '../../src/app.setup';
import { Public } from '../../src/common/decorators/public.decorator';
import { SkipCsrf } from '../../src/common/decorators/skip-csrf.decorator';
import { ApiExceptionFilter } from '../../src/common/filters/api-exception.filter';
import { CsrfGuard } from '../../src/common/guards/csrf.guard';
import { SessionAuthGuard } from '../../src/common/guards/session-auth.guard';
import { ConfigModule } from '../../src/infra/config/config.module';
import { CryptoModule } from '../../src/infra/crypto/crypto.module';
import { PrismaModule } from '../../src/infra/prisma/prisma.module';
import { RedisModule } from '../../src/infra/redis/redis.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { SessionService } from '../../src/modules/auth/session.service';
import { createUser } from '../setup/factories';
import { closeHarness, getPrisma, resetDb } from '../setup/test-app';

const APP_URL = 'http://localhost:5173'; // the harness's APP_URL

@Controller('t')
class ProbeController {
  @Get('read')
  read() {
    return { ok: true };
  }

  @Post('write')
  write() {
    return { ok: true };
  }

  @Put('write')
  put() {
    return { ok: true };
  }

  @Patch('write')
  patch() {
    return { ok: true };
  }

  @Delete('write')
  remove() {
    return { ok: true };
  }

  @Public()
  @Post('login')
  login() {
    return { ok: true };
  }

  @Public()
  @SkipCsrf()
  @Post('hook')
  hook() {
    return { ok: true };
  }
}

const FORBIDDEN = { error: { code: ErrorCode.FORBIDDEN, message: expect.any(String) } };
const UNAUTH = { error: { code: ErrorCode.UNAUTHENTICATED, message: expect.any(String) } };

const setCookies = (res: request.Response): string[] =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []);

describe('CsrfGuard + GET /auth/csrf (guards in order SessionAuth → Csrf)', () => {
  let app: NestExpressApplication;
  let sessions: SessionService;

  beforeAll(async () => {
    await getPrisma(); // sets this worker's container env before modules read it
    const mod = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule, RedisModule, CryptoModule, AuthModule],
      controllers: [ProbeController],
      providers: [
        { provide: APP_GUARD, useClass: SessionAuthGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
    }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    sessions = app.get(SessionService);
  });
  beforeEach(resetDb);
  afterAll(async () => {
    await app?.close();
    await closeHarness();
  });

  const http = () => request(app.getHttpServer());

  /** Fetches a CSRF token the way the SPA does; returns it (cookie value === body token). */
  const csrf = async (): Promise<string> => {
    const res = await http().get('/api/v1/auth/csrf').expect(200);
    return res.body.csrfToken as string;
  };

  describe('GET /auth/csrf', () => {
    it('is public, returns { csrfToken } and sets the same value in a readable kora_csrf cookie', async () => {
      const res = await http().get('/api/v1/auth/csrf').expect(200);
      expect(res.body).toEqual({ csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
      const cookies = setCookies(res);
      expect(cookies).toHaveLength(1);
      const cookie = cookies[0]!;
      expect(cookie).toMatch(new RegExp(`^kora_csrf=${res.body.csrfToken as string};`));
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Max-Age=2592000');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).not.toContain('HttpOnly'); // the SPA must read it
      expect(cookie).not.toContain('Secure'); // NODE_ENV=test (plain http)
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('issues a fresh random token on every call', async () => {
      expect(await csrf()).not.toBe(await csrf());
    });
  });

  describe('safe methods are never checked', () => {
    it('GET and HEAD pass without Origin, header or cookie', async () => {
      const user = await createUser();
      const sid = await sessions.create(user.id, { headers: {}, ip: '127.0.0.1' });
      await http().get('/api/v1/t/read').set('Cookie', `kora_sid=${sid}`).expect(200);
      await http().head('/api/v1/t/read').set('Cookie', `kora_sid=${sid}`).expect(200);
    });
  });

  describe('@Public state-changing route (login-like) is still checked', () => {
    it('valid Origin + matching header and cookie → passes', async () => {
      const token = await csrf();
      await http()
        .post('/api/v1/t/login')
        .set('Origin', APP_URL)
        .set('Cookie', `kora_csrf=${token}`)
        .set('X-CSRF-Token', token)
        .expect(201);
    });

    it('no token at all → 403 FORBIDDEN', async () => {
      const res = await http().post('/api/v1/t/login').set('Origin', APP_URL).expect(403);
      expect(res.body).toEqual(FORBIDDEN);
    });

    it('header without cookie → 403', async () => {
      const token = await csrf();
      const res = await http()
        .post('/api/v1/t/login')
        .set('Origin', APP_URL)
        .set('X-CSRF-Token', token)
        .expect(403);
      expect(res.body).toEqual(FORBIDDEN);
    });

    it('cookie without header → 403', async () => {
      const token = await csrf();
      const res = await http()
        .post('/api/v1/t/login')
        .set('Origin', APP_URL)
        .set('Cookie', `kora_csrf=${token}`)
        .expect(403);
      expect(res.body).toEqual(FORBIDDEN);
    });

    it('mismatched header and cookie → 403', async () => {
      const token = await csrf();
      const other = await csrf();
      const res = await http()
        .post('/api/v1/t/login')
        .set('Origin', APP_URL)
        .set('Cookie', `kora_csrf=${token}`)
        .set('X-CSRF-Token', other)
        .expect(403);
      expect(res.body).toEqual(FORBIDDEN);
    });

    it('empty header and empty cookie (equal, but blank) → 403', async () => {
      const res = await http()
        .post('/api/v1/t/login')
        .set('Origin', APP_URL)
        .set('Cookie', 'kora_csrf=')
        .set('X-CSRF-Token', '')
        .expect(403);
      expect(res.body).toEqual(FORBIDDEN);
    });

    it('missing Origin → 403 even with a matching token', async () => {
      const token = await csrf();
      const res = await http()
        .post('/api/v1/t/login')
        .set('Cookie', `kora_csrf=${token}`)
        .set('X-CSRF-Token', token)
        .expect(403);
      expect(res.body).toEqual(FORBIDDEN);
    });

    it.each([
      'https://evil.example',
      'http://localhost:5174', // different port
      'https://localhost:5173', // different scheme
      'http://localhost:5173.evil.example',
      'null',
    ])('Origin %s → 403 even with a matching token', async (origin) => {
      const token = await csrf();
      const res = await http()
        .post('/api/v1/t/login')
        .set('Origin', origin)
        .set('Cookie', `kora_csrf=${token}`)
        .set('X-CSRF-Token', token)
        .expect(403);
      expect(res.body).toEqual(FORBIDDEN);
    });
  });

  describe('authenticated (session cookie) routes', () => {
    const loginCookie = async () => {
      const user = await createUser();
      return `kora_sid=${await sessions.create(user.id, { headers: {}, ip: '127.0.0.1' })}`;
    };

    it.each(['post', 'put', 'patch', 'delete'] as const)(
      '%s with a valid session but no CSRF token → 403; with one → 2xx',
      async (method) => {
        const sid = await loginCookie();
        const send = (agent = http()) => agent[method]('/api/v1/t/write');
        const bad = await send().set('Origin', APP_URL).set('Cookie', sid);
        expect(bad.status).toBe(403);
        expect(bad.body).toEqual(FORBIDDEN);

        const token = await csrf();
        const good = await send()
          .set('Origin', APP_URL)
          .set('Cookie', `${sid}; kora_csrf=${token}`)
          .set('X-CSRF-Token', token);
        expect(good.status).toBeLessThan(300);
      },
    );

    it('no session → 401 from SessionAuthGuard first (it runs before CsrfGuard)', async () => {
      const res = await http().post('/api/v1/t/write').expect(401);
      expect(res.body).toEqual(UNAUTH);
    });
  });

  describe('exemptions', () => {
    it('@SkipCsrf() route passes without Origin or token', async () => {
      await http().post('/api/v1/t/hook').expect(201);
    });

    it('Bearer header alongside a kora_sid session cookie does NOT skip CSRF → 403', async () => {
      const user = await createUser();
      const sid = await sessions.create(user.id, { headers: {}, ip: '127.0.0.1' });
      const res = await http()
        .post('/api/v1/t/write')
        .set('Authorization', 'Bearer x')
        .set('Cookie', `kora_sid=${sid}`)
        .expect(403);
      expect(res.body).toEqual(FORBIDDEN);
    });

    it('Bearer-authenticated request skips CSRF (no Origin, no token)', async () => {
      await http()
        .post('/api/v1/t/login')
        .set('Authorization', 'Bearer kora_pat_abc123')
        .expect(201);
    });

    it.each(['Basic dXNlcjpwYXNz', 'Bearer', 'Bearer   ', 'kora_pat_abc123'])(
      'Authorization %j is not a Bearer token → still checked (403)',
      async (authorization) => {
        const res = await http()
          .post('/api/v1/t/login')
          .set('Authorization', authorization)
          .expect(403);
        expect(res.body).toEqual(FORBIDDEN);
      },
    );
  });
});
