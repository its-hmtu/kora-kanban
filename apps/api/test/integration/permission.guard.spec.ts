import { randomUUID } from 'node:crypto';
import { Controller, Get, Patch, Post, type LoggerService } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { ErrorCode } from '@kora/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApp } from '../../src/app.setup';
import { AccessModule } from '../../src/common/access/access.module';
import {
  ResourceAccessRegistry,
  type ResourceAccess,
} from '../../src/common/access/resource-access.registry';
import { Public } from '../../src/common/decorators/public.decorator';
import { RequirePermission } from '../../src/common/decorators/require-permission.decorator';
import { ApiExceptionFilter } from '../../src/common/filters/api-exception.filter';
import { CsrfGuard } from '../../src/common/guards/csrf.guard';
import { PermissionGuard } from '../../src/common/guards/permission.guard';
import { SessionAuthGuard } from '../../src/common/guards/session-auth.guard';
import { ConfigModule } from '../../src/infra/config/config.module';
import { CryptoModule } from '../../src/infra/crypto/crypto.module';
import { PrismaModule } from '../../src/infra/prisma/prisma.module';
import { RedisModule } from '../../src/infra/redis/redis.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { MailModule } from '../../src/infra/mail/mail.module';
import { QueueModule } from '../../src/infra/queue/queue.module';
import { SessionService } from '../../src/modules/auth/session.service';
import { createUser } from '../setup/factories';
import { closeHarness, getPrisma, resetDb } from '../setup/test-app';

const APP_URL = 'http://localhost:5173';

@Controller('t')
class ProbeController {
  @Get('open')
  open() {
    return { ok: true };
  }

  @RequirePermission('workspace.view', { resource: 'workspace', param: 'wid' })
  @Get('workspaces/:wid')
  viewWorkspace() {
    return { ok: true };
  }

  @RequirePermission('workspace.delete', { resource: 'workspace', param: 'wid' })
  @Post('workspaces/:wid/delete')
  deleteWorkspace() {
    return { ok: true };
  }

  @RequirePermission('board.view', { resource: 'board', param: 'bid' })
  @Get('boards/:bid')
  viewBoard() {
    return { ok: true };
  }

  @RequirePermission('board.settings', { resource: 'board', param: 'bid' })
  @Patch('boards/:bid/settings')
  boardSettings() {
    return { ok: true };
  }

  @RequirePermission('board.cards.write', { resource: 'card', param: 'id' })
  @Get('cards/:id')
  editCard() {
    return { ok: true };
  }

  @RequirePermission('board.view', { resource: 'column', param: 'id' })
  @Get('columns/:id')
  unregisteredResource() {
    return { ok: true };
  }

  @RequirePermission('board.view', { resource: 'board', param: 'bid' })
  @Get('misconfigured/:id')
  wrongParam() {
    return { ok: true };
  }

  @Public()
  @RequirePermission('board.view', { resource: 'board', param: 'bid' })
  @Get('public-boards/:bid')
  publicBoard() {
    return { ok: true };
  }
}

const FORBIDDEN = { error: { code: ErrorCode.FORBIDDEN, message: expect.any(String) } };
const NOT_FOUND = { error: { code: ErrorCode.NOT_FOUND, message: expect.any(String) } };
const UNAUTH = { error: { code: ErrorCode.UNAUTHENTICATED, message: expect.any(String) } };
const INTERNAL = { error: { code: ErrorCode.INTERNAL, message: expect.any(String) } };

describe('PermissionGuard + ResourceAccessRegistry (guards in order SessionAuth → Csrf → Permission)', () => {
  let app: NestExpressApplication;
  let sessions: SessionService;
  /** Captures the filter's 500 logs (keeps output pristine and lets tests assert them). */
  const errorLogs: unknown[][] = [];
  const logger: LoggerService = {
    log: () => undefined,
    warn: () => undefined,
    error: (...args: unknown[]) => void errorLogs.push(args),
  };

  /** Fake resolvers: access keyed by `${resourceId}:${userId}`; every call is recorded. */
  const grants = new Map<string, ResourceAccess>();
  const calls: { resource: string; id: string; userId: string }[] = [];
  const fakeResolver =
    (resource: string) =>
    async (id: string, userId: string): Promise<ResourceAccess | null> => {
      calls.push({ resource, id, userId });
      return grants.get(`${id}:${userId}`) ?? null;
    };

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
        AccessModule,
      ],
      controllers: [ProbeController],
      providers: [
        { provide: APP_GUARD, useClass: SessionAuthGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
    }).compile();
    app = mod.createNestApplication<NestExpressApplication>({ logger: false });
    app.useLogger(logger);
    configureApp(app);
    await app.init();
    sessions = app.get(SessionService);
    const registry = app.get(ResourceAccessRegistry);
    registry.register('workspace', fakeResolver('workspace'));
    registry.register('board', fakeResolver('board'));
    registry.register('card', fakeResolver('card'));
  });
  beforeEach(async () => {
    await resetDb();
    grants.clear();
    calls.length = 0;
    errorLogs.length = 0;
  });
  afterAll(async () => {
    await app?.close();
    await closeHarness();
  });

  const http = () => request(app.getHttpServer());

  /** Logs a fresh user in; returns their id and a Cookie header value (session + CSRF). */
  const login = async () => {
    const user = await createUser();
    const sid = await sessions.create(user.id, { headers: {}, ip: '127.0.0.1' });
    const csrf = (await http().get('/api/v1/auth/csrf').expect(200)).body.csrfToken as string;
    return { userId: user.id, cookie: `kora_sid=${sid}; kora_csrf=${csrf}`, csrf };
  };

  it('a route without @RequirePermission is allowed and no resolver runs', async () => {
    const { cookie } = await login();
    await http().get('/api/v1/t/open').set('Cookie', cookie).expect(200);
    expect(calls).toEqual([]);
  });

  describe('workspace permissions (resolver workspaceRole)', () => {
    it('calls the resolver with the route param and the session user id', async () => {
      const { userId, cookie } = await login();
      const wid = randomUUID();
      grants.set(`${wid}:${userId}`, { workspaceRole: 'VIEWER' });
      await http().get(`/api/v1/t/workspaces/${wid}`).set('Cookie', cookie).expect(200);
      expect(calls).toEqual([{ resource: 'workspace', id: wid, userId }]);
    });

    it('OWNER may delete the workspace (allowed)', async () => {
      const { userId, cookie, csrf } = await login();
      const wid = randomUUID();
      grants.set(`${wid}:${userId}`, { workspaceRole: 'OWNER' });
      await http()
        .post(`/api/v1/t/workspaces/${wid}/delete`)
        .set('Origin', APP_URL)
        .set('X-CSRF-Token', csrf)
        .set('Cookie', cookie)
        .expect(201);
    });

    it('ADMIN may not delete the workspace → 403 FORBIDDEN', async () => {
      const { userId, cookie, csrf } = await login();
      const wid = randomUUID();
      grants.set(`${wid}:${userId}`, { workspaceRole: 'ADMIN' });
      const res = await http()
        .post(`/api/v1/t/workspaces/${wid}/delete`)
        .set('Origin', APP_URL)
        .set('X-CSRF-Token', csrf)
        .set('Cookie', cookie)
        .expect(403);
      expect(res.body).toEqual(FORBIDDEN);
    });

    it('never trusts a client-supplied role (query, header, body) → still 403', async () => {
      const { userId, cookie, csrf } = await login();
      const wid = randomUUID();
      grants.set(`${wid}:${userId}`, { workspaceRole: 'VIEWER' });
      const res = await http()
        .post(`/api/v1/t/workspaces/${wid}/delete?workspaceRole=OWNER&role=OWNER`)
        .set('Origin', APP_URL)
        .set('X-CSRF-Token', csrf)
        .set('X-Workspace-Role', 'OWNER')
        .set('Cookie', cookie)
        .send({ workspaceRole: 'OWNER', role: 'OWNER' })
        .expect(403);
      expect(res.body).toEqual(FORBIDDEN);
    });

    it('resolver returns null (not a member / does not exist) → 404 NOT_FOUND', async () => {
      const { cookie } = await login();
      const res = await http()
        .get(`/api/v1/t/workspaces/${randomUUID()}`)
        .set('Cookie', cookie)
        .expect(404);
      expect(res.body).toEqual(NOT_FOUND);
    });

    it("another user's grant does not apply → 404", async () => {
      const owner = await login();
      const stranger = await login();
      const wid = randomUUID();
      grants.set(`${wid}:${owner.userId}`, { workspaceRole: 'OWNER' });
      await http().get(`/api/v1/t/workspaces/${wid}`).set('Cookie', stranger.cookie).expect(404);
    });

    it('non-uuid id → 404 without calling the resolver', async () => {
      const { cookie } = await login();
      const res = await http()
        .get('/api/v1/t/workspaces/not-a-uuid')
        .set('Cookie', cookie)
        .expect(404);
      expect(res.body).toEqual(NOT_FOUND);
      expect(calls).toEqual([]);
    });
  });

  describe('board permissions (resolver boardRole)', () => {
    it('board ADMIN may change board settings (allowed)', async () => {
      const { userId, cookie, csrf } = await login();
      const bid = randomUUID();
      grants.set(`${bid}:${userId}`, { workspaceRole: 'MEMBER', boardRole: 'ADMIN' });
      await http()
        .patch(`/api/v1/t/boards/${bid}/settings`)
        .set('Origin', APP_URL)
        .set('X-CSRF-Token', csrf)
        .set('Cookie', cookie)
        .expect(200);
    });

    it('board MEMBER may not change board settings → 403, even as workspace OWNER on the resolver result', async () => {
      // The board permission is decided by boardRole alone; workspaceRole does not leak in.
      const { userId, cookie, csrf } = await login();
      const bid = randomUUID();
      grants.set(`${bid}:${userId}`, { workspaceRole: 'OWNER', boardRole: 'MEMBER' });
      const res = await http()
        .patch(`/api/v1/t/boards/${bid}/settings`)
        .set('Origin', APP_URL)
        .set('X-CSRF-Token', csrf)
        .set('Cookie', cookie)
        .send({ boardRole: 'ADMIN' })
        .expect(403);
      expect(res.body).toEqual(FORBIDDEN);
    });

    it('board VIEWER may view the board (allowed)', async () => {
      const { userId, cookie } = await login();
      const bid = randomUUID();
      grants.set(`${bid}:${userId}`, { workspaceRole: 'VIEWER', boardRole: 'VIEWER' });
      await http().get(`/api/v1/t/boards/${bid}`).set('Cookie', cookie).expect(200);
    });

    it('a board permission with no boardRole in the resolver result → 403', async () => {
      const { userId, cookie } = await login();
      const bid = randomUUID();
      grants.set(`${bid}:${userId}`, { workspaceRole: 'OWNER' });
      const res = await http().get(`/api/v1/t/boards/${bid}`).set('Cookie', cookie).expect(403);
      expect(res.body).toEqual(FORBIDDEN);
    });

    it('card resource: board MEMBER may write cards; VIEWER → 403; unknown card → 404', async () => {
      const { userId, cookie } = await login();
      const writable = randomUUID();
      const readOnly = randomUUID();
      grants.set(`${writable}:${userId}`, { boardRole: 'MEMBER' });
      grants.set(`${readOnly}:${userId}`, { boardRole: 'VIEWER' });
      await http().get(`/api/v1/t/cards/${writable}`).set('Cookie', cookie).expect(200);
      expect(
        (await http().get(`/api/v1/t/cards/${readOnly}`).set('Cookie', cookie).expect(403)).body,
      ).toEqual(FORBIDDEN);
      expect(
        (await http().get(`/api/v1/t/cards/${randomUUID()}`).set('Cookie', cookie).expect(404))
          .body,
      ).toEqual(NOT_FOUND);
      expect(calls.map((c) => c.resource)).toEqual(['card', 'card', 'card']);
    });

    it('a resolver returning an unknown role string → 403 (no throw)', async () => {
      const { userId, cookie } = await login();
      const bid = randomUUID();
      grants.set(`${bid}:${userId}`, { boardRole: 'SUPERUSER' as never });
      await http().get(`/api/v1/t/boards/${bid}`).set('Cookie', cookie).expect(403);
    });
  });

  describe('authentication and programming errors', () => {
    it('anonymous request to a @Public route with @RequirePermission → 401 (defensive)', async () => {
      const res = await http().get(`/api/v1/t/public-boards/${randomUUID()}`).expect(401);
      expect(res.body).toEqual(UNAUTH);
      expect(calls).toEqual([]);
    });

    it('resource type with no registered resolver → 500 INTERNAL, not 404', async () => {
      const { cookie } = await login();
      const res = await http()
        .get(`/api/v1/t/columns/${randomUUID()}`)
        .set('Cookie', cookie)
        .expect(500);
      expect(res.body).toEqual(INTERNAL);
      expect(String(errorLogs[0]?.[0])).toContain(
        'No resource access resolver registered for "column"',
      );
    });

    it('route param named in the decorator is missing from the route → 500 INTERNAL', async () => {
      const { cookie } = await login();
      const res = await http()
        .get(`/api/v1/t/misconfigured/${randomUUID()}`)
        .set('Cookie', cookie)
        .expect(500);
      expect(res.body).toEqual(INTERNAL);
      expect(String(errorLogs[0]?.[0])).toContain('@RequirePermission param "bid"');
      expect(calls).toEqual([]);
    });
  });
});
