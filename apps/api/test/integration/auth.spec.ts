import { Controller, Get, Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ErrorCode } from '@kora/shared';
import type { Job, Queue } from 'bullmq';
import request, { type Response } from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentUser } from '../../src/common/decorators/current-user.decorator';
import { APP_CONFIG } from '../../src/infra/config/config.module';
import type { Env } from '../../src/infra/config/env';
import { MailService } from '../../src/infra/mail/mail.service';
import type { EmailJob } from '../../src/infra/mail/mail.types';
import type { PrismaService } from '../../src/infra/prisma/prisma.service';
import type { AuthUser } from '../../src/modules/auth/auth.types';
import { PasswordService } from '../../src/modules/auth/password.service';
import {
  SESSION_REVOKED_EVENT,
  SessionRevokedEvent,
} from '../../src/modules/auth/session-revoked.event';
import { CLOCK, SessionService, type Clock } from '../../src/modules/auth/session.service';
import { VerificationService } from '../../src/modules/auth/verification.service';
import { createUser } from '../setup/factories';
import { agentFor, closeHarness, createTestApp, getPrisma, resetDb } from '../setup/test-app';

/** A signed-in-only probe: 200 with the user id, or 401 when the session is not valid. */
@Controller('t')
class ProbeController {
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { id: user.id };
  }
}

const API = '/api/v1';
const PASSWORD = 'correct horse battery staple';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

let clockOffset = 0;
const clock: Clock = { now: () => new Date(Date.now() + clockOffset) };

let app: NestExpressApplication;
let prisma: PrismaService;
let appUrl: string;
let appOrigin: string;

beforeAll(async () => {
  app = await createTestApp({
    controllers: [ProbeController],
    overrides: [{ provide: CLOCK, useValue: clock }],
  });
  prisma = await getPrisma();
  appUrl = app.get<Env>(APP_CONFIG).APP_URL;
  appOrigin = new URL(appUrl).origin;
});
beforeEach(async () => {
  clockOffset = 0;
  await resetDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(closeHarness);

/** All Set-Cookie values for `name` in a response. */
function setCookies(res: Response, name: string): string[] {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return (raw ?? []).filter((c) => c.startsWith(`${name}=`));
}
function cookieValue(res: Response, name: string): string | undefined {
  return setCookies(res, name)[0]
    ?.split(';')[0]!
    .slice(name.length + 1);
}

/** An anonymous browser: has fetched a CSRF token and sends it with `Origin` = APP_URL. */
async function anonAgent(): Promise<request.Agent> {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.get(`${API}/auth/csrf`).expect(200);
  return agent.set('Origin', appOrigin).set('X-CSRF-Token', res.body.csrfToken as string);
}

/** Like the SPA after sign-in: picks up the rotated `kora_csrf` cookie for later requests. */
function adoptCsrf(agent: request.Agent, res: Response): request.Agent {
  const token = cookieValue(res, 'kora_csrf');
  if (!token) throw new Error('response did not issue a kora_csrf cookie');
  return agent.set('X-CSRF-Token', token);
}

async function emailJobs(): Promise<EmailJob[]> {
  const queue = app.get<Queue<EmailJob>>(getQueueToken('email'));
  return (await queue.getJobs(['waiting'])).map((job: Job<EmailJob>) => job.data);
}

function tokenFrom(job: EmailJob | undefined, path: string): string {
  if (!job) throw new Error('no email job');
  const url = new URL(job.props.url);
  expect(`${url.origin}${url.pathname}`).toBe(`${appUrl}${path}`);
  return url.searchParams.get('token')!;
}

/** A user with a real argon2 password hash. */
async function userWithPassword(overrides: Parameters<typeof createUser>[0] = {}) {
  const passwordHash = await app.get(PasswordService).hash(PASSWORD);
  return createUser({ passwordHash, ...overrides });
}

const asSession = (token: string) =>
  request(app.getHttpServer()).get(`${API}/t/me`).set('Cookie', `kora_sid=${token}`);

const register = async (body: object) =>
  (await anonAgent()).post(`${API}/auth/register`).send(body);

const login = async (email: string, password = PASSWORD) =>
  (await anonAgent()).post(`${API}/auth/login`).send({ email, password });

const UNAUTH = {
  error: { code: ErrorCode.UNAUTHENTICATED, message: expect.any(String) as unknown },
};

describe('POST /auth/register', () => {
  it('creates the user, signs them in and enqueues a verify email', async () => {
    const agent = await anonAgent();
    const res = await agent
      .post(`${API}/auth/register`)
      .send({ email: ' Ada@Example.com ', password: PASSWORD, name: 'Ada' })
      .expect(201);

    const user = await prisma.client.user.findUniqueOrThrow({
      where: { email: 'ada@example.com' },
    });
    expect(res.body).toEqual({
      user: {
        id: user.id,
        email: 'ada@example.com',
        emailVerifiedAt: null,
        name: 'Ada',
        locale: 'en',
        theme: 'system',
        timezone: 'UTC',
      },
    });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await app.get(PasswordService).verify(user.passwordHash!, PASSWORD)).toBe(true);

    // Signed in: an HttpOnly session cookie that works, and a fresh CSRF token.
    expect(setCookies(res, 'kora_sid')[0]).toMatch(/HttpOnly/);
    await asSession(cookieValue(res, 'kora_sid')!).expect(200, { id: user.id });
    expect(cookieValue(res, 'kora_csrf')).toBeTruthy();

    const jobs = await emailJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      to: 'ada@example.com',
      template: 'verify-email',
      locale: 'en',
      props: { name: 'Ada' },
    });
    expect(tokenFrom(jobs[0], '/verify-email')).toMatch(/^[\w-]{43}$/);
  });

  it('rejects a duplicate email (case-insensitively) with 422 EMAIL_TAKEN', async () => {
    await createUser({ email: 'grace@example.com' });
    const res = await register({ email: 'GRACE@example.com', password: PASSWORD, name: 'G' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: ErrorCode.VALIDATION,
      details: { fieldErrors: { email: ['EMAIL_TAKEN'] } },
    });
    expect(setCookies(res, 'kora_sid')).toEqual([]);
    expect(await emailJobs()).toEqual([]);
  });

  it('rejects a breached password and an invalid body with 422, creating nothing', async () => {
    const breached = await register({ email: 'a@example.com', password: 'qwertyuiop', name: 'A' });
    expect(breached.status).toBe(422);
    expect(breached.body.error.details).toEqual({
      fieldErrors: { password: ['PASSWORD_BREACHED'] },
    });

    const invalid = await register({ email: 'not-an-email', password: 'short', name: '' });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe(ErrorCode.VALIDATION);

    expect(await prisma.client.user.count()).toBe(0);
  });

  it('without a CSRF token → 403 (login CSRF protection) and no user', async () => {
    const body = { email: 'csrf@example.com', password: PASSWORD, name: 'C' };
    const res = await request(app.getHttpServer())
      .post(`${API}/auth/register`)
      .set('Origin', appOrigin)
      .send(body);
    expect(res.status).toBe(403);
    expect(await prisma.client.user.count()).toBe(0);
  });
});

describe('POST /auth/verify-email', () => {
  it('consumes the emailed token and marks the email verified (no session needed); single use', async () => {
    await register({ email: 'v@example.com', password: PASSWORD, name: 'V' });
    const token = tokenFrom((await emailJobs())[0], '/verify-email');

    await (await anonAgent()).post(`${API}/auth/verify-email`).send({ token }).expect(204);
    const user = await prisma.client.user.findUniqueOrThrow({ where: { email: 'v@example.com' } });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);

    const again = await (await anonAgent()).post(`${API}/auth/verify-email`).send({ token });
    expect(again.status).toBe(422);
    expect(again.body.error.details).toEqual({ fieldErrors: { token: ['TOKEN_INVALID'] } });
  });

  it('keeps the original timestamp when the email is already verified', async () => {
    const verifiedAt = new Date('2026-01-01T00:00:00.000Z');
    const user = await createUser({ emailVerifiedAt: verifiedAt });
    const token = await app.get(VerificationService).issue(user.id, 'email_verify');
    await (await anonAgent()).post(`${API}/auth/verify-email`).send({ token }).expect(204);
    const after = await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.emailVerifiedAt).toEqual(verifiedAt);
  });

  it('rejects an unknown token or a password-reset token with 422', async () => {
    const user = await createUser({ emailVerifiedAt: null });
    const resetToken = await app.get(VerificationService).issue(user.id, 'password_reset');
    for (const token of ['nope', resetToken]) {
      const res = await (await anonAgent()).post(`${API}/auth/verify-email`).send({ token });
      expect(res.status).toBe(422);
    }
    const after = await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.emailVerifiedAt).toBeNull();
  });
});

describe('POST /auth/login', () => {
  it('sets an HttpOnly kora_sid cookie, rotates kora_csrf and returns { user }', async () => {
    const user = await userWithPassword({ email: 'login@example.com', name: 'Lin' });
    const agent = await anonAgent();
    const res = await agent
      .post(`${API}/auth/login`)
      .send({ email: 'LOGIN@example.com', password: PASSWORD })
      .expect(200);

    expect(res.body).toEqual({
      user: {
        id: user.id,
        email: 'login@example.com',
        emailVerifiedAt: user.emailVerifiedAt!.toISOString(),
        name: 'Lin',
        locale: 'en',
        theme: 'system',
        timezone: 'UTC',
      },
    });
    const [sid] = setCookies(res, 'kora_sid');
    expect(sid).toMatch(/HttpOnly/);
    expect(sid).toMatch(/SameSite=Lax/);
    expect(sid).toMatch(/Path=\//);
    await asSession(cookieValue(res, 'kora_sid')!).expect(200, { id: user.id });

    // The pre-login CSRF token no longer works; the one issued at login does.
    expect((await agent.post(`${API}/auth/logout`)).status).toBe(403);
    await adoptCsrf(agent, res).post(`${API}/auth/logout`).expect(204);
  });

  it('lets an unverified user sign in', async () => {
    const user = await userWithPassword({ email: 'unverified@example.com', emailVerifiedAt: null });
    const res = await login('unverified@example.com');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, emailVerifiedAt: null });
  });

  it('wrong password, unknown email, password-less (OAuth-only) and deleted users → the same 401', async () => {
    await userWithPassword({ email: 'known@example.com' });
    await createUser({ email: 'oauth@example.com', passwordHash: null });
    await userWithPassword({ email: 'gone@example.com', deletedAt: new Date() });

    for (const [email, password] of [
      ['known@example.com', 'wrong password 123'],
      ['nobody@example.com', PASSWORD],
      ['oauth@example.com', PASSWORD],
      ['gone@example.com', PASSWORD],
    ] as const) {
      const res = await login(email, password);
      expect(res.status, email).toBe(401);
      expect(res.body, email).toEqual(UNAUTH);
      expect(setCookies(res, 'kora_sid'), email).toEqual([]);
    }
    expect(await prisma.client.session.count()).toBe(0);
  });

  it('the 11th attempt within a minute → 429 with Retry-After', async () => {
    await userWithPassword({ email: 'brute@example.com' });
    const agent = await anonAgent();
    for (let i = 0; i < 10; i++) {
      const res = await agent
        .post(`${API}/auth/login`)
        .send({ email: 'brute@example.com', password: `guess number ${i}` });
      expect(res.status).toBe(401);
    }
    const res = await agent
      .post(`${API}/auth/login`)
      .send({ email: 'brute@example.com', password: PASSWORD });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(setCookies(res, 'kora_sid')).toEqual([]);
  });

  it('revokes the session the browser already had (no session fixation)', async () => {
    const other = await createUser();
    const user = await userWithPassword({ email: 'switch@example.com' });
    const agent = await agentFor(other);
    const oldSessions = await prisma.client.session.findMany({ where: { userId: other.id } });
    expect(oldSessions).toHaveLength(1);

    const res = await agent
      .post(`${API}/auth/login`)
      .send({ email: 'switch@example.com', password: PASSWORD })
      .expect(200);
    expect(res.body.user.id).toBe(user.id);
    expect(await prisma.client.session.count({ where: { userId: other.id } })).toBe(0);
    await agent.get(`${API}/t/me`).expect(200, { id: user.id });
  });

  describe('login racing a concurrent revocation', () => {
    /** Runs `concurrent` after the password was verified but before the session row exists. */
    function interleave(concurrent: (userId: string) => Promise<unknown>) {
      const sessions = app.get(SessionService);
      const create = sessions.create.bind(sessions);
      vi.spyOn(sessions, 'create').mockImplementationOnce(async (userId, req) => {
        await concurrent(userId);
        return create(userId, req);
      });
    }

    it('a password reset/change that revoked everything mid-login → 401 and no session survives', async () => {
      await userWithPassword({ email: 'race@example.com' });
      const newHash = await app.get(PasswordService).hash('changed meanwhile phrase');
      interleave(async (userId) => {
        await prisma.client.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
        await app.get(SessionService).revokeAllForUser(userId);
      });
      const res = await login('race@example.com');
      expect(res.status).toBe(401);
      expect(res.body).toEqual(UNAUTH);
      expect(setCookies(res, 'kora_sid')).toEqual([]);
      expect(setCookies(res, 'kora_csrf')).toEqual([]);
      expect(await prisma.client.session.count()).toBe(0);
    });

    it('an OAuth takeover that cleared the password mid-login → 401', async () => {
      await userWithPassword({ email: 'race-oauth@example.com' });
      interleave((userId) =>
        prisma.client.user.update({ where: { id: userId }, data: { passwordHash: null } }),
      );
      expect((await login('race-oauth@example.com')).status).toBe(401);
      expect(await prisma.client.session.count()).toBe(0);
    });

    it('an account deleted mid-login → 401', async () => {
      await userWithPassword({ email: 'race-del@example.com' });
      interleave((userId) =>
        prisma.client.user.update({ where: { id: userId }, data: { deletedAt: new Date() } }),
      );
      expect((await login('race-del@example.com')).status).toBe(401);
      expect(await prisma.client.session.count()).toBe(0);
    });

    it('an OAuth takeover transaction still open while login creates its session → 401', async () => {
      // Mirrors OAuthService: one interactive transaction clears the password and deletes the
      // sessions, and commits only after login has created its session and re-read the user.
      const user = await userWithPassword({ email: 'race-tx@example.com' });
      const sessions = app.get(SessionService);
      let txWrote!: () => void;
      const wrote = new Promise<void>((resolve) => (txWrote = resolve));
      let commit!: () => void;
      const committed = new Promise<void>((resolve) => (commit = resolve));
      let afterCommit: (() => Promise<void>) | undefined;
      const takeover = prisma.client.$transaction(
        async (tx) => {
          await tx.user.update({ where: { id: user.id }, data: { passwordHash: null } });
          afterCommit = await sessions.revokeAllForUserInTx(tx, user.id);
          txWrote();
          await committed;
        },
        { timeout: 30_000 },
      );
      interleave(() => wrote);

      let settled = false;
      const attempt = login('race-tx@example.com').finally(() => (settled = true));
      // Commit once login is blocked on a row lock (the fix) or has already answered (the bug).
      const lockWaits = async () =>
        (
          await prisma.client.$queryRaw<{ n: bigint }[]>`
            SELECT count(*) AS n FROM pg_locks WHERE NOT granted`
        )[0]!.n > 0n;
      await wrote;
      while (!settled && !(await lockWaits())) await new Promise((r) => setTimeout(r, 10));
      commit();
      await takeover;
      await afterCommit?.();

      const res = await attempt;
      expect(res.status).toBe(401);
      expect(setCookies(res, 'kora_sid')).toEqual([]);
      expect(setCookies(res, 'kora_csrf')).toEqual([]);
      expect(await prisma.client.session.count()).toBe(0);
    });
  });

  it('without a CSRF token → 403 (login CSRF protection)', async () => {
    await userWithPassword({ email: 'csrf@example.com' });
    const agent = await anonAgent();
    const res = await agent
      .post(`${API}/auth/login`)
      .unset('X-CSRF-Token')
      .send({ email: 'csrf@example.com', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(await prisma.client.session.count()).toBe(0);
  });
});

describe('POST /auth/logout', () => {
  it('ends the current session only and clears the session and CSRF cookies', async () => {
    const user = await createUser();
    const other = await agentFor(user);
    const agent = await agentFor(user);
    await agent.get(`${API}/t/me`).expect(200);

    const res = await agent.post(`${API}/auth/logout`).expect(204);
    expect(setCookies(res, 'kora_sid')[0]).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(setCookies(res, 'kora_csrf')[0]).toMatch(/Expires=Thu, 01 Jan 1970/);

    expect(await prisma.client.session.count({ where: { userId: user.id } })).toBe(1);
    await other.get(`${API}/t/me`).expect(200);
  });

  it('invalidates the cookie server-side (replaying the old token → 401)', async () => {
    const user = await userWithPassword({ email: 'replay@example.com' });
    const signIn = await login('replay@example.com');
    const token = cookieValue(signIn, 'kora_sid')!;
    const csrf = cookieValue(signIn, 'kora_csrf')!;

    await request(app.getHttpServer())
      .post(`${API}/auth/logout`)
      .set('Cookie', [`kora_sid=${token}`, `kora_csrf=${csrf}`])
      .set('Origin', appOrigin)
      .set('X-CSRF-Token', csrf)
      .expect(204);
    expect((await asSession(token)).body).toEqual(UNAUTH);
    expect(await prisma.client.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('a non-GET without X-CSRF-Token → 403 and the session survives', async () => {
    const user = await createUser();
    const agent = await agentFor(user);
    expect((await agent.post(`${API}/auth/logout`).unset('X-CSRF-Token')).status).toBe(403);
    await agent.get(`${API}/t/me`).expect(200);
  });

  it('requires a session (401 when anonymous)', async () => {
    const res = await (await anonAgent()).post(`${API}/auth/logout`);
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout-all', () => {
  it('invalidates every session of the user (not others) and emits SessionRevokedEvent', async () => {
    const user = await createUser();
    const bystander = await createUser();
    const phone = await agentFor(user);
    const laptop = await agentFor(user);
    const someoneElse = await agentFor(bystander);
    const events: SessionRevokedEvent[] = [];
    const listener = (event: SessionRevokedEvent) => events.push(event);
    app.get(EventEmitter2).on(SESSION_REVOKED_EVENT, listener);

    try {
      const res = await laptop.post(`${API}/auth/logout-all`).expect(204);
      expect(setCookies(res, 'kora_sid')[0]).toMatch(/Expires=Thu, 01 Jan 1970/);
    } finally {
      app.get(EventEmitter2).off(SESSION_REVOKED_EVENT, listener);
    }

    expect(events).toEqual([new SessionRevokedEvent({ userId: user.id, all: true })]);
    for (const agent of [phone, laptop]) expect((await agent.get(`${API}/t/me`)).status).toBe(401);
    await someoneElse.get(`${API}/t/me`).expect(200);
    expect(await prisma.client.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('requires a session (401 when anonymous)', async () => {
    expect((await (await anonAgent()).post(`${API}/auth/logout-all`)).status).toBe(401);
  });
});

describe('POST /auth/password/forgot', () => {
  it('returns 204 for unknown and deleted accounts too, sending nothing', async () => {
    await createUser({ email: 'deleted@example.com', deletedAt: new Date() });
    for (const email of ['nobody@example.com', 'deleted@example.com']) {
      const res = await (await anonAgent()).post(`${API}/auth/password/forgot`).send({ email });
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
    }
    expect(await emailJobs()).toEqual([]);
  });

  it('enqueues a reset-password email (in the user locale) for an existing account', async () => {
    await createUser({ email: 'reset@example.com', name: 'Rae', locale: 'zh_CN' });
    await (
      await anonAgent()
    )
      .post(`${API}/auth/password/forgot`)
      .send({ email: 'Reset@Example.com' })
      .expect(204);
    const jobs = await emailJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      to: 'reset@example.com',
      template: 'reset-password',
      locale: 'zh-CN',
      props: { name: 'Rae' },
    });
    expect(tokenFrom(jobs[0], '/reset-password')).toMatch(/^[\w-]{43}$/);
  });

  it('still returns 204 when issuing the token or enqueueing the email fails', async () => {
    await createUser({ email: 'flaky@example.com' });
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(app.get(VerificationService), 'issue').mockRejectedValueOnce(new Error('db down'));
    vi.spyOn(app.get(MailService), 'send').mockRejectedValueOnce(new Error('redis down'));
    for (let i = 0; i < 2; i++) {
      const res = await (
        await anonAgent()
      )
        .post(`${API}/auth/password/forgot`)
        .send({ email: 'flaky@example.com' });
      expect(res.status).toBe(204);
    }
    expect(await emailJobs()).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(2);
  });
});

describe('POST /auth/password/reset', () => {
  async function requestReset(email: string): Promise<string> {
    const before = new Set((await emailJobs()).map((job) => job.props.url));
    await (await anonAgent()).post(`${API}/auth/password/forgot`).send({ email }).expect(204);
    const added = (await emailJobs()).filter((job) => !before.has(job.props.url));
    expect(added).toHaveLength(1);
    return tokenFrom(added[0], '/reset-password');
  }
  const reset = async (token: string, password: string) =>
    (await anonAgent()).post(`${API}/auth/password/reset`).send({ token, password });

  it('sets the new password, revokes every session (password change rotates sessions), does not sign in', async () => {
    const user = await userWithPassword({ email: 'rot@example.com' });
    const signedIn = await agentFor(user);
    const events: SessionRevokedEvent[] = [];
    const listener = (event: SessionRevokedEvent) => events.push(event);
    app.get(EventEmitter2).on(SESSION_REVOKED_EVENT, listener);
    const token = await requestReset('rot@example.com');

    let res: Response;
    try {
      res = await reset(token, 'a brand new passphrase');
    } finally {
      app.get(EventEmitter2).off(SESSION_REVOKED_EVENT, listener);
    }
    expect(res.status).toBe(204);
    expect(setCookies(res, 'kora_sid')).toEqual([]);
    expect(events).toEqual([new SessionRevokedEvent({ userId: user.id, all: true })]);

    expect((await signedIn.get(`${API}/t/me`)).status).toBe(401);
    expect(await prisma.client.session.count()).toBe(0);
    expect((await login('rot@example.com', PASSWORD)).status).toBe(401);
    expect((await login('rot@example.com', 'a brand new passphrase')).status).toBe(200);
  });

  it('a reset token is single-use', async () => {
    await userWithPassword({ email: 'once@example.com' });
    const token = await requestReset('once@example.com');
    expect((await reset(token, 'first new passphrase')).status).toBe(204);
    const second = await reset(token, 'second new passphrase');
    expect(second.status).toBe(422);
    expect(second.body.error.details).toEqual({ fieldErrors: { token: ['TOKEN_INVALID'] } });
    expect((await login('once@example.com', 'first new passphrase')).status).toBe(200);
  });

  it('a reset token expires after 1 h', async () => {
    await userWithPassword({ email: 'late@example.com' });
    const early = await requestReset('late@example.com');
    clockOffset = HOUR - MINUTE;
    expect((await reset(early, 'just in time phrase')).status).toBe(204);

    clockOffset = 0;
    const late = await requestReset('late@example.com');
    clockOffset = HOUR + 1_000;
    const res = await reset(late, 'too late passphrase');
    expect(res.status).toBe(422);
    expect((await login('late@example.com', 'just in time phrase')).status).toBe(200);
  });

  it('rejects a breached password with 422 without spending the token', async () => {
    await userWithPassword({ email: 'weak@example.com' });
    const token = await requestReset('weak@example.com');
    const weak = await reset(token, 'basketball');
    expect(weak.status).toBe(422);
    expect(weak.body.error.details).toEqual({ fieldErrors: { password: ['PASSWORD_BREACHED'] } });
    expect((await reset(token, 'a much stronger phrase')).status).toBe(204);
  });

  it('marks an unverified email verified (the link proved inbox control); keeps an earlier timestamp', async () => {
    const user = await userWithPassword({ email: 'unver@example.com', emailVerifiedAt: null });
    expect(
      (await reset(await requestReset('unver@example.com'), 'fresh passphrase one')).status,
    ).toBe(204);
    const after = await prisma.client.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.emailVerifiedAt).toBeInstanceOf(Date);

    const verifiedAt = new Date('2025-01-01T00:00:00Z');
    const old = await userWithPassword({ email: 'ver@example.com', emailVerifiedAt: verifiedAt });
    expect(
      (await reset(await requestReset('ver@example.com'), 'fresh passphrase two')).status,
    ).toBe(204);
    const kept = await prisma.client.user.findUniqueOrThrow({ where: { id: old.id } });
    expect(kept.emailVerifiedAt).toEqual(verifiedAt);
  });

  it('does not hash the password for an invalid token (no anonymous argon2 work)', async () => {
    const hash = vi.spyOn(app.get(PasswordService), 'hash');
    const res = await reset('not-a-real-token', 'some new passphrase');
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual({ fieldErrors: { token: ['TOKEN_INVALID'] } });
    expect(hash).not.toHaveBeenCalled();
  });

  it('rejects an email-verification token', async () => {
    const user = await userWithPassword({ email: 'wrongtype@example.com' });
    const token = await app.get(VerificationService).issue(user.id, 'email_verify');
    expect((await reset(token, 'whatever new phrase')).status).toBe(422);
  });
});
