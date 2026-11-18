import { Controller, Get, Param, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ErrorCode } from '@kora/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ResourceAccessRegistry } from '../../src/common/access/resource-access.registry';
import { CurrentUser } from '../../src/common/decorators/current-user.decorator';
import { RequirePermission } from '../../src/common/decorators/require-permission.decorator';
import { AuthThrottle } from '../../src/infra/throttler/use-throttler.decorator';
import type { AuthUser } from '../../src/modules/auth/auth.types';
import { createUser } from '../setup/factories';
import { agentFor, closeHarness, createTestApp, resetDb } from '../setup/test-app';

@Controller('probe')
class ProbeController {
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { id: user.id };
  }

  @Post('write')
  write(@CurrentUser() user: AuthUser) {
    return { id: user.id };
  }

  @Post('throttled')
  @AuthThrottle()
  throttled() {
    return { ok: true };
  }

  @Post('workspaces/:wid')
  @RequirePermission('workspace.rename', { resource: 'workspace', param: 'wid' })
  update(@Param('wid') wid: string) {
    return { wid };
  }
}

const OWNED_WORKSPACE = '01960000-0000-7000-8000-000000000001';
const OTHER_WORKSPACE = '01960000-0000-7000-8000-000000000000';
const errorCode = (res: request.Response): unknown =>
  (res.body as { error: { code: string } }).error.code;

let app: NestExpressApplication;

beforeAll(async () => {
  app = await createTestApp({ controllers: [ProbeController] });
  app
    .get(ResourceAccessRegistry)
    .register('workspace', (id) => (id === OWNED_WORKSPACE ? { workspaceRole: 'OWNER' } : null));
});

beforeEach(resetDb);
afterAll(closeHarness);

describe('AppModule global guards (SessionAuth → Csrf → Permission) + filter', () => {
  it('rejects an unauthenticated request to a protected route with 401 before CSRF runs', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/probe/write');
    expect(res.status).toBe(401);
    expect(errorCode(res)).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('rejects a signed-in POST without CSRF proof with 403', async () => {
    const user = await createUser();
    const agent = await agentFor(user);
    const res = await agent.post('/api/v1/probe/write').unset('X-CSRF-Token');
    expect(res.status).toBe(403);
    expect(errorCode(res)).toBe(ErrorCode.FORBIDDEN);
  });

  it('checks CSRF before permissions (403, not the resolver 404)', async () => {
    const user = await createUser();
    const agent = await agentFor(user);
    const res = await agent.post(`/api/v1/probe/workspaces/${OTHER_WORKSPACE}`).unset('Origin');
    expect(res.status).toBe(403);
  });

  it('lets an agentFor() GET and POST through every guard as that user', async () => {
    const user = await createUser();
    const agent = await agentFor(user);
    expect((await agent.get('/api/v1/probe/me').expect(200)).body).toEqual({ id: user.id });
    expect((await agent.post('/api/v1/probe/write').expect(201)).body).toEqual({ id: user.id });
  });

  it('enforces @RequirePermission after auth and CSRF pass', async () => {
    const agent = await agentFor(await createUser());
    await agent.post(`/api/v1/probe/workspaces/${OWNED_WORKSPACE}`).expect(201);
    const res = await agent.post(`/api/v1/probe/workspaces/${OTHER_WORKSPACE}`);
    expect(res.status).toBe(404);
    expect(errorCode(res)).toBe(ErrorCode.NOT_FOUND);
  });

  it('runs the throttler guard last, so rejected requests spend no rate-limit budget', async () => {
    // `auth` allows 10/min: if the throttler ran first, the 11th request would be a 429.
    for (let i = 0; i < 11; i++) {
      await request(app.getHttpServer()).post('/api/v1/probe/throttled').expect(401);
    }
  });
});
