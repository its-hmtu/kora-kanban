import { Controller, Get } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ErrorCode } from '@kora/shared';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CurrentUser } from '../../src/common/decorators/current-user.decorator';
import { APP_CONFIG } from '../../src/infra/config/config.module';
import type { Env } from '../../src/infra/config/env';
import type { PrismaService } from '../../src/infra/prisma/prisma.service';
import type { AuthUser } from '../../src/modules/auth/auth.types';
import { PasswordService } from '../../src/modules/auth/password.service';
import {
  SESSION_REVOKED_EVENT,
  SessionRevokedEvent,
} from '../../src/modules/auth/session-revoked.event';
import { CLOCK, type Clock } from '../../src/modules/auth/session.service';
import { createUser } from '../setup/factories';
import { agentFor, closeHarness, createTestApp, getPrisma, resetDb } from '../setup/test-app';

/** Echoes `req.user` as the session guard resolved it (shows what later requests see). */
@Controller('t')
class ProbeController {
  @Get('whoami')
  whoami(@CurrentUser() user: AuthUser) {
    return { name: user.name, locale: user.locale, timezone: user.timezone };
  }
}

const API = '/api/v1';
const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a completely new passphrase';

let clockOffset = 0;
const clock: Clock = { now: () => new Date(Date.now() + clockOffset) };

let app: NestExpressApplication;
let prisma: PrismaService;
let appOrigin: string;

beforeAll(async () => {
  app = await createTestApp({
    controllers: [ProbeController],
    overrides: [{ provide: CLOCK, useValue: clock }],
  });
  prisma = await getPrisma();
  appOrigin = new URL(app.get<Env>(APP_CONFIG).APP_URL).origin;
});
beforeEach(async () => {
  clockOffset = 0;
  await resetDb();
});
afterAll(closeHarness);

function setCookies(res: Response, name: string): string[] {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return (raw ?? []).filter((c) => c.startsWith(`${name}=`));
}
function cookieValue(res: Response, name: string): string | undefined {
  return setCookies(res, name)[0]
    ?.split(';')[0]!
    .slice(name.length + 1);
}

async function userWithPassword(overrides: Parameters<typeof createUser>[0] = {}) {
  const passwordHash = await app.get(PasswordService).hash(PASSWORD);
  return createUser({ passwordHash, ...overrides });
}

async function anonAgent() {
  const agent = request.agent(app.getHttpServer());
  const csrf = await agent.get(`${API}/auth/csrf`).expect(200);
  return agent.set('Origin', appOrigin).set('X-CSRF-Token', csrf.body.csrfToken as string);
}

async function login(email: string, password: string): Promise<Response> {
  const agent = request.agent(app.getHttpServer());
  const csrf = await agent.get(`${API}/auth/csrf`).expect(200);
  return agent
    .post(`${API}/auth/login`)
    .set('Origin', appOrigin)
    .set('X-CSRF-Token', csrf.body.csrfToken as string)
    .send({ email, password });
}

function captureRevocations(): { events: SessionRevokedEvent[]; stop: () => void } {
  const events: SessionRevokedEvent[] = [];
  const listener = (event: SessionRevokedEvent) => events.push(event);
  const emitter = app.get(EventEmitter2);
  emitter.on(SESSION_REVOKED_EVENT, listener);
  return { events, stop: () => emitter.off(SESSION_REVOKED_EVENT, listener) };
}

const validation = (fieldErrors: Record<string, string[]>) => ({
  error: {
    code: ErrorCode.VALIDATION,
    message: expect.any(String) as unknown,
    details: { fieldErrors },
  },
});

describe('GET /me', () => {
  it('returns the profile, linked providers and an empty workspace list (never the hash)', async () => {
    const verifiedAt = new Date('2025-03-01T10:00:00Z');
    const user = await userWithPassword({
      email: 'me@example.com',
      name: 'Ada',
      avatarUrl: 'https://example.com/ada.png',
      locale: 'zh_CN',
      theme: 'dark',
      timezone: 'Europe/Paris',
      emailVerifiedAt: verifiedAt,
    });
    for (const provider of ['github', 'google'] as const) {
      await prisma.client.oAuthAccount.create({
        data: {
          userId: user.id,
          provider,
          providerUserId: `${provider}-1`,
          email: 'me@example.com',
          emailVerified: true,
        },
      });
    }

    const res = await (await agentFor(user)).get(`${API}/me`).expect(200);
    expect(res.body).toEqual({
      user: {
        id: user.id,
        email: 'me@example.com',
        name: 'Ada',
        avatarUrl: 'https://example.com/ada.png',
        locale: 'zh-CN',
        theme: 'dark',
        timezone: 'Europe/Paris',
        emailVerifiedAt: verifiedAt.toISOString(),
        hasPassword: true,
      },
      providers: ['github', 'google'],
      workspaces: [],
    });
    expect(JSON.stringify(res.body)).not.toContain('argon2');
  });

  it('reports hasPassword false for an OAuth-only user', async () => {
    const user = await createUser({ passwordHash: null, emailVerifiedAt: null });
    const res = await (await agentFor(user)).get(`${API}/me`).expect(200);
    expect(res.body.user).toMatchObject({
      hasPassword: false,
      emailVerifiedAt: null,
      avatarUrl: null,
    });
    expect(res.body.providers).toEqual([]);
  });

  it('requires a session', async () => {
    const res = await request(app.getHttpServer()).get(`${API}/me`);
    expect(res.status).toBe(401);
  });
});

describe('PATCH /me', () => {
  it('updates the profile and returns the GET /me body; the next request sees it', async () => {
    const user = await createUser({ name: 'Old Name' });
    const agent = await agentFor(user);
    // Prime the 60 s session cache before changing the profile.
    await agent
      .get(`${API}/t/whoami`)
      .expect(200, { name: 'Old Name', locale: 'en', timezone: 'UTC' });

    const res = await agent
      .patch(`${API}/me`)
      .send({ name: '  New Name ', locale: 'zh-CN', theme: 'light', timezone: 'Asia/Tokyo' })
      .expect(200);
    expect(res.body.user).toMatchObject({
      id: user.id,
      name: 'New Name',
      locale: 'zh-CN',
      theme: 'light',
      timezone: 'Asia/Tokyo',
    });
    expect(res.body).toEqual((await agent.get(`${API}/me`).expect(200)).body);

    await agent
      .get(`${API}/t/whoami`)
      .expect(200, { name: 'New Name', locale: 'zh_CN', timezone: 'Asia/Tokyo' });
    const row = await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ name: 'New Name', locale: 'zh_CN', theme: 'light' });
  });

  it('sets and clears the avatar URL', async () => {
    const user = await createUser();
    const agent = await agentFor(user);
    const url = 'https://cdn.example.com/a.png';
    expect((await agent.patch(`${API}/me`).send({ avatarUrl: url })).body.user.avatarUrl).toBe(url);
    expect((await agent.patch(`${API}/me`).send({ avatarUrl: null })).body.user.avatarUrl).toBe(
      null,
    );
  });

  it('rejects invalid values and unknown keys (e.g. email) with 422, changing nothing', async () => {
    const user = await createUser({ email: 'keep@example.com', name: 'Keep' });
    const agent = await agentFor(user);
    for (const body of [
      { name: '   ' },
      { timezone: 'europe/paris' },
      { avatarUrl: 'http://insecure.example.com/a.png' },
      { email: 'other@example.com' },
      { passwordHash: 'x' },
    ]) {
      const res = await agent.patch(`${API}/me`).send(body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION);
    }
    const row = await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ email: 'keep@example.com', name: 'Keep' });
  });

  it('requires the CSRF token', async () => {
    const user = await createUser({ name: 'Same' });
    const res = await (
      await agentFor(user)
    )
      .patch(`${API}/me`)
      .unset('X-CSRF-Token')
      .send({ name: 'Changed' });
    expect(res.status).toBe(403);
    expect((await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe(
      'Same',
    );
  });
});

describe('PUT /me/password', () => {
  it('changes the password, revokes every other session and rotates the current one', async () => {
    const user = await userWithPassword({ email: 'rotate@example.com' });
    const other = await createUser();
    const agent = await agentFor(user);
    const otherDevice = await agentFor(user);
    const bystander = await agentFor(other);
    const oldSid = (await prisma.client.session.findMany({ where: { userId: user.id } })).map(
      (s) => s.id,
    );
    expect(oldSid).toHaveLength(2);

    const { events, stop } = captureRevocations();
    let res: Response;
    try {
      res = await agent
        .put(`${API}/me/password`)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    } finally {
      stop();
    }
    expect(res.status).toBe(204);
    expect(events).toContainEqual(new SessionRevokedEvent({ userId: user.id, all: true }));

    // A new session cookie and a fresh CSRF token for this browser.
    const newSid = cookieValue(res, 'kora_sid');
    const newCsrf = cookieValue(res, 'kora_csrf');
    expect(newSid).toBeTruthy();
    expect(newCsrf).toBeTruthy();
    const sessions = await prisma.client.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(1);
    expect(oldSid).not.toContain(sessions[0]!.id);

    // The agent keeps the new cookie; the old CSRF token is gone with the old session's cookie.
    await agent.get(`${API}/me`).expect(200);
    await agent
      .set('X-CSRF-Token', newCsrf!)
      .patch(`${API}/me`)
      .send({ name: 'Still Me' })
      .expect(200);
    expect((await otherDevice.get(`${API}/me`)).status).toBe(401);
    await bystander.get(`${API}/me`).expect(200);

    expect((await login('rotate@example.com', PASSWORD)).status).toBe(401);
    expect((await login('rotate@example.com', NEW_PASSWORD)).status).toBe(200);
  });

  it('a wrong current password → 422 PASSWORD_INCORRECT; nothing changes', async () => {
    const user = await userWithPassword({ email: 'wrong@example.com' });
    const agent = await agentFor(user);
    const res = await agent
      .put(`${API}/me/password`)
      .send({ currentPassword: 'not my password', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(422);
    expect(res.body).toEqual(validation({ currentPassword: ['PASSWORD_INCORRECT'] }));
    expect(setCookies(res, 'kora_sid')).toEqual([]);
    await agent.get(`${API}/me`).expect(200);
    expect((await login('wrong@example.com', PASSWORD)).status).toBe(200);
  });

  it('an OAuth-only user (no password) → 422 PASSWORD_NOT_SET', async () => {
    const user = await createUser({ passwordHash: null });
    const res = await (
      await agentFor(user)
    )
      .put(`${API}/me/password`)
      .send({ currentPassword: 'anything at all', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(422);
    expect(res.body).toEqual(validation({ currentPassword: ['PASSWORD_NOT_SET'] }));
    expect(
      (await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash,
    ).toBe(null);
  });

  it('a breached new password → 422 on newPassword; nothing changes', async () => {
    const user = await userWithPassword({ email: 'breach@example.com' });
    const res = await (
      await agentFor(user)
    )
      .put(`${API}/me/password`)
      .send({ currentPassword: PASSWORD, newPassword: 'basketball' });
    expect(res.status).toBe(422);
    expect(res.body).toEqual(validation({ newPassword: ['PASSWORD_BREACHED'] }));
    expect((await login('breach@example.com', PASSWORD)).status).toBe(200);
  });

  it('is rate limited like sign-in (the 11th guess within a minute → 429)', async () => {
    const user = await userWithPassword({ email: 'guess@example.com' });
    const agent = await agentFor(user);
    for (let i = 0; i < 10; i++) {
      const res = await agent
        .put(`${API}/me/password`)
        .send({ currentPassword: `guess number ${i}`, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(422);
    }
    const res = await agent
      .put(`${API}/me/password`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(429);
    expect((await login('guess@example.com', PASSWORD)).status).toBe(200);
  });

  it('requires the CSRF token', async () => {
    const user = await userWithPassword({ email: 'csrfpw@example.com' });
    const res = await (
      await agentFor(user)
    )
      .put(`${API}/me/password`)
      .unset('X-CSRF-Token')
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(403);
    expect((await login('csrfpw@example.com', PASSWORD)).status).toBe(200);
  });
});

describe('DELETE /me', () => {
  it('soft-deletes the account, revokes every session and clears the cookies', async () => {
    const user = await userWithPassword({ email: 'bye@example.com' });
    const agent = await agentFor(user);
    const otherDevice = await agentFor(user);

    const { events, stop } = captureRevocations();
    let res: Response;
    try {
      res = await agent.delete(`${API}/me`);
    } finally {
      stop();
    }
    expect(res.status).toBe(204);
    expect(events).toEqual([new SessionRevokedEvent({ userId: user.id, all: true })]);
    expect(setCookies(res, 'kora_sid')[0]).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(setCookies(res, 'kora_csrf')[0]).toMatch(/Expires=Thu, 01 Jan 1970/);

    const row = await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(await prisma.client.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await otherDevice.get(`${API}/me`)).status).toBe(401);

    // A soft-deleted user cannot sign in again.
    const again = await login('bye@example.com', PASSWORD);
    expect(again.status).toBe(401);
    expect(setCookies(again, 'kora_sid')).toEqual([]);
  });

  it('scrubs the email, credentials and linked data so the address can register again', async () => {
    const user = await userWithPassword({ email: 'again@example.com' });
    await prisma.client.oAuthAccount.create({
      data: {
        userId: user.id,
        provider: 'github',
        providerUserId: 'gh-1',
        email: 'again@example.com',
        emailVerified: true,
      },
    });
    const expiresAt = new Date(Date.now() + 3_600_000);
    await prisma.client.verificationToken.createMany({
      data: [
        { userId: user.id, type: 'password_reset', tokenHash: 'unused', expiresAt },
        { userId: user.id, type: 'email_verify', tokenHash: 'used', expiresAt, usedAt: new Date() },
      ],
    });
    const agent = await agentFor(user);
    await agent.delete(`${API}/me`).expect(204);

    const row = await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({
      email: `deleted+${user.id}@deleted.invalid`,
      passwordHash: null,
      emailVerifiedAt: null,
    });
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(await prisma.client.oAuthAccount.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await prisma.client.verificationToken.count({ where: { userId: user.id, usedAt: null } }),
    ).toBe(0);
    expect(await prisma.client.session.count({ where: { userId: user.id } })).toBe(0);

    const registered = await (
      await anonAgent()
    )
      .post(`${API}/auth/register`)
      .send({ email: 'again@example.com', password: PASSWORD, name: 'New Me' });
    expect(registered.status).toBe(201);
    const newUser = (registered.body as { user: { id: string } }).user;
    expect(newUser.id).not.toBe(user.id);
    // The old session stays dead; the deleted row is untouched by the new account.
    expect((await agent.get(`${API}/me`)).status).toBe(401);
    expect(
      (await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } })).deletedAt,
    ).not.toBe(null);
  });

  it('stamps deletedAt from the injected clock', async () => {
    const user = await createUser();
    const agent = await agentFor(user);
    clockOffset = 3_600_000;
    const before = Date.now();
    await agent.delete(`${API}/me`).expect(204);
    const row = await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.deletedAt!.getTime()).toBeGreaterThanOrEqual(before + 3_600_000);
  });

  it('requires the CSRF token', async () => {
    const user = await createUser();
    const res = await (await agentFor(user)).delete(`${API}/me`).unset('X-CSRF-Token');
    expect(res.status).toBe(403);
    expect((await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } })).deletedAt).toBe(
      null,
    );
  });

  it('requires a session', async () => {
    const res = await request(app.getHttpServer()).delete(`${API}/me`).set('Origin', appOrigin);
    expect(res.status).toBe(401);
  });
});
