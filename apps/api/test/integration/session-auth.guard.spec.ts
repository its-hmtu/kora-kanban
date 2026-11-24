import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { ErrorCode } from '@kora/shared';
import type { Request, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApp } from '../../src/app.setup';
import { CurrentUser } from '../../src/common/decorators/current-user.decorator';
import { Public } from '../../src/common/decorators/public.decorator';
import { ApiExceptionFilter } from '../../src/common/filters/api-exception.filter';
import { SessionAuthGuard } from '../../src/common/guards/session-auth.guard';
import { ConfigModule } from '../../src/infra/config/config.module';
import { CryptoModule } from '../../src/infra/crypto/crypto.module';
import { CryptoService } from '../../src/infra/crypto/crypto.service';
import { PrismaModule } from '../../src/infra/prisma/prisma.module';
import { RedisModule } from '../../src/infra/redis/redis.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { MailModule } from '../../src/infra/mail/mail.module';
import { QueueModule } from '../../src/infra/queue/queue.module';
import type { AuthUser } from '../../src/modules/auth/auth.types';
import { SessionService } from '../../src/modules/auth/session.service';
import { createUser } from '../setup/factories';
import { closeHarness, getPrisma, getRedis, resetDb } from '../setup/test-app';

@Controller('t')
class ProbeController {
  constructor(private readonly sessions: SessionService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return { user, sessionUserId: req.session?.userId };
  }

  @Public()
  @Get('open')
  open(@Req() req: Request) {
    return { user: req.user ?? null };
  }

  @Public()
  @Get('login/:userId')
  async login(@Param('userId') userId: string, @Req() req: Request, @Res() res: Response) {
    this.sessions.setSessionCookie(res, await this.sessions.create(userId, req));
    res.json({ ok: true });
  }

  @Get('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    await this.sessions.revoke(req.cookies.kora_sid as string);
    this.sessions.clearSessionCookie(res);
    res.json({ ok: true });
  }
}

@Public()
@Controller('pub')
class PublicController {
  @Get()
  index() {
    return { ok: true };
  }
}

const UNAUTH = { error: { code: ErrorCode.UNAUTHENTICATED, message: expect.any(String) } };

describe('SessionAuthGuard (real Postgres + Redis)', () => {
  let app: NestExpressApplication;
  let crypto: CryptoService;

  beforeAll(async () => {
    await getPrisma(); // sets this worker's container env before modules read it
    const mod = await Test.createTestingModule({
      imports: [
        ConfigModule,
        EventEmitterModule.forRoot(),
        PrismaModule,
        RedisModule,
        CryptoModule,
        QueueModule,
        MailModule,
        AuthModule,
      ],
      controllers: [ProbeController, PublicController],
      providers: [
        { provide: APP_GUARD, useClass: SessionAuthGuard },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
    }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    crypto = app.get(CryptoService);
  });
  beforeEach(resetDb);
  afterAll(async () => {
    await app?.close();
    await closeHarness();
  });

  const login = async (userId: string): Promise<string> => {
    const res = await request(app.getHttpServer()).get(`/api/v1/t/login/${userId}`).expect(200);
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0] ?? '';
    return /^kora_sid=([^;]+)/.exec(cookie)![1]!;
  };
  const get = (path: string, token?: string) => {
    const r = request(app.getHttpServer()).get(`/api/v1${path}`);
    return token === undefined ? r : r.set('Cookie', `kora_sid=${token}`);
  };

  it('login sets kora_sid: HttpOnly, SameSite=Lax, Path=/, Max-Age=30d, not Secure outside production', async () => {
    const user = await createUser();
    const res = await get(`/t/login/${user.id}`).expect(200);
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!;
    expect(cookie).toMatch(/^kora_sid=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('Max-Age=2592000');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
  });

  it('protected route without a cookie → 401 UNAUTHENTICATED envelope', async () => {
    const res = await get('/t/me').expect(401);
    expect(res.body).toEqual(UNAUTH);
  });

  it('protected route with an unknown cookie → 401', async () => {
    const res = await get('/t/me', crypto.randomToken()).expect(401);
    expect(res.body).toEqual(UNAUTH);
  });

  it('protected route with an expired session → 401', async () => {
    const user = await createUser();
    const token = await login(user.id);
    const prisma = await getPrisma();
    await prisma.client.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await get('/t/me', token).expect(401)).body).toEqual(UNAUTH);
  });

  it('protected route for a soft-deleted user → 401', async () => {
    const user = await createUser();
    const token = await login(user.id);
    const prisma = await getPrisma();
    await prisma.client.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
    expect((await get('/t/me', token).expect(401)).body).toEqual(UNAUTH);
  });

  it('valid cookie → req.user (minimal fields) and req.session set; @CurrentUser returns the user', async () => {
    const user = await createUser({ name: 'Grace', passwordHash: 'secret-hash' });
    const token = await login(user.id);
    const res = await get('/t/me', token).expect(200);
    expect(res.body).toEqual({
      user: {
        id: user.id,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt!.toISOString(),
        name: 'Grace',
        locale: 'en',
        theme: 'system',
        timezone: 'UTC',
      },
      sessionUserId: user.id,
    });
  });

  it('@Public route: never 401, and req.user is populated when a valid cookie is present', async () => {
    expect((await get('/t/open').expect(200)).body).toEqual({ user: null });
    expect((await get('/t/open', 'garbage').expect(200)).body).toEqual({ user: null });
    const user = await createUser();
    const token = await login(user.id);
    expect((await get('/t/open', token).expect(200)).body.user.id).toBe(user.id);
  });

  it('@Public on a controller class applies to all its routes', async () => {
    await get('/pub').expect(200);
  });

  it('slides the kora_sid cookie when the session slid (at most once per hour)', async () => {
    const user = await createUser();
    const token = await login(user.id);
    const prisma = await getPrisma();
    const redis = await getRedis();
    const setCookie = (res: request.Response) =>
      ([] as string[]).concat(res.headers['set-cookie'] ?? []);

    expect(setCookie(await get('/t/me', token).expect(200))).toEqual([]);

    // Pretend the last slide was 61 min ago (DB and cache).
    await prisma.client.session.updateMany({
      data: { lastSeenAt: new Date(Date.now() - 61 * 60_000) },
    });
    await redis.flushdb();
    const slid = setCookie(await get('/t/me', token).expect(200));
    expect(slid).toHaveLength(1);
    expect(slid[0]).toMatch(new RegExp(`^kora_sid=${token};`));
    expect(slid[0]).toContain('Max-Age=2592000');
    expect(slid[0]).toContain('HttpOnly');

    expect(setCookie(await get('/t/me', token).expect(200))).toEqual([]);
  });

  it('logout revokes the session and clears the cookie', async () => {
    const user = await createUser();
    const token = await login(user.id);
    const res = await get('/t/logout', token).expect(200);
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!;
    expect(cookie).toMatch(/^kora_sid=;/);
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
    expect(cookie).toContain('HttpOnly');
    await get('/t/me', token).expect(401);
  });
});
