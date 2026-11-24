import { ErrorCode } from '@kora/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../src/common/errors/domain-error';
import { loadEnv } from '../../src/infra/config/env';
import { CryptoService } from '../../src/infra/crypto/crypto.service';
import type { PrismaService } from '../../src/infra/prisma/prisma.service';
import {
  SESSION_CACHE_TTL_SECONDS,
  SESSION_TTL_MS,
  SessionService,
  type SessionRequestInfo,
} from '../../src/modules/auth/session.service';
import {
  SESSION_REVOKED_EVENT,
  SessionRevokedEvent,
} from '../../src/modules/auth/session-revoked.event';
import { createUser } from '../setup/factories';
import { closeHarness, getPrisma, getRedis, resetDb } from '../setup/test-app';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = new Date('2026-03-01T10:00:00.000Z');
const req: SessionRequestInfo = { headers: { 'user-agent': 'vitest-agent' }, ip: '203.0.113.7' };

describe('SessionService (real Postgres + Redis)', () => {
  let prisma: PrismaService;
  let redis: Redis;
  let crypto: CryptoService;
  let svc: SessionService;
  let now: Date;
  let revoked: SessionRevokedEvent[];
  const advance = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };
  const cacheKey = (token: string) => `sess:${crypto.sha256(token)}`;

  beforeAll(async () => {
    prisma = await getPrisma();
    redis = await getRedis();
    const env = loadEnv();
    crypto = new CryptoService(env);
    const events = new EventEmitter2();
    events.on(SESSION_REVOKED_EVENT, (event: SessionRevokedEvent) => revoked.push(event));
    svc = new SessionService(prisma, redis, crypto, env, { now: () => now }, events);
  });
  beforeEach(async () => {
    await resetDb();
    now = T0;
    revoked = [];
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(closeHarness);

  it('exposes the research A10 constants', () => {
    expect(SESSION_TTL_MS).toBe(30 * DAY);
    expect(SESSION_CACHE_TTL_SECONDS).toBe(60);
  });

  it('create: 256-bit random token; stores only its sha256 with a 30-day expiry', async () => {
    const user = await createUser();
    const token = await svc.create(user.id, req);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(await svc.create(user.id, req)).not.toBe(token);

    const row = await prisma.client.session.findUniqueOrThrow({
      where: { tokenHash: crypto.sha256(token) },
    });
    expect(row.userId).toBe(user.id);
    expect(row.expiresAt).toEqual(new Date(T0.getTime() + 30 * DAY));
    expect(row.lastSeenAt).toEqual(T0);
    expect(row.userAgent).toBe('vitest-agent');
    expect(row.ip).toBe('203.0.113.7');
    const raw = await prisma.client.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "Session" s WHERE row_to_json(s)::text LIKE ${'%' + token + '%'}`;
    expect(Number(raw[0]!.n)).toBe(0);
  });

  it('validate: returns the session and the minimal user, never the password hash', async () => {
    const user = await createUser({ name: 'Ada', passwordHash: 'secret-hash' });
    const token = await svc.create(user.id, req);
    const ctx = await svc.validate(token);
    expect(ctx?.user).toEqual({
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      name: 'Ada',
      locale: 'en',
      theme: 'system',
      timezone: 'UTC',
    });
    expect(ctx?.session).toMatchObject({
      userId: user.id,
      expiresAt: new Date(T0.getTime() + 30 * DAY),
    });
  });

  it('validate: caches only session fields under sess:{sha256} with a 60 s TTL', async () => {
    const user = await createUser();
    const token = await svc.create(user.id, req);
    await svc.validate(token);
    const key = cacheKey(token);
    const cached = await redis.get(key);
    expect(cached).not.toBeNull();
    expect(Object.keys(JSON.parse(cached!)).sort()).toEqual(
      ['expiresAt', 'id', 'lastSeenAt', 'userId'].sort(),
    );
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
    for (const k of await redis.keys('*')) {
      expect(k).not.toContain(token);
      expect(await redis.get(k)).not.toContain(token);
    }
  });

  it('validate: a cache hit avoids the session lookup in Postgres', async () => {
    const user = await createUser();
    const token = await svc.create(user.id, req);
    await svc.validate(token);
    // Delete the row behind the cache's back: only a cache hit can still succeed.
    await prisma.client.$executeRaw`DELETE FROM "Session"`;
    expect((await svc.validate(token))?.user.id).toBe(user.id);
    await redis.del(cacheKey(token));
    expect(await svc.validate(token)).toBeNull();
  });

  it('validate: a cache hit does not extend the cache TTL (out-of-band deletes expire within 60 s)', async () => {
    const user = await createUser();
    const token = await svc.create(user.id, req);
    await svc.validate(token); // miss -> cached for 60 s
    await redis.expire(cacheKey(token), 5);
    await svc.validate(token); // hit
    expect(await redis.ttl(cacheKey(token))).toBeLessThanOrEqual(5);
  });

  it('validate: reports refreshed only when it slid the expiry', async () => {
    const user = await createUser();
    const token = await svc.create(user.id, req);
    expect((await svc.validate(token))?.refreshed).toBe(false);
    advance(61 * MINUTE);
    expect((await svc.validate(token))?.refreshed).toBe(true);
    expect((await svc.validate(token))?.refreshed).toBe(false);
  });

  it('validate: a revoke landing between the DB read and the cache write is not re-cached', async () => {
    const user = await createUser();
    const token = await svc.create(user.id, req);
    const realSet = redis.set.bind(redis);
    vi.spyOn(redis, 'set').mockImplementationOnce((async (...args: unknown[]) => {
      await svc.revoke(token); // concurrent sign-out completes first
      return (realSet as (...a: unknown[]) => Promise<unknown>)(...args);
    }) as never);
    expect(await svc.validate(token)).toBeNull();
    expect(await redis.exists(cacheKey(token))).toBe(0);
    expect(await svc.validate(token)).toBeNull();
  });

  it('validate: a revoke landing during the slide is not re-cached', async () => {
    const user = await createUser();
    const token = await svc.create(user.id, req);
    await svc.validate(token); // cached
    advance(61 * MINUTE);
    const realSet = redis.set.bind(redis);
    vi.spyOn(redis, 'set').mockImplementationOnce((async (...args: unknown[]) => {
      await svc.revoke(token);
      return (realSet as (...a: unknown[]) => Promise<unknown>)(...args);
    }) as never);
    expect(await svc.validate(token)).toBeNull();
    expect(await redis.exists(cacheKey(token))).toBe(0);
  });

  it('validate: unknown, empty or over-long tokens are rejected', async () => {
    expect(await svc.validate('nope')).toBeNull();
    expect(await svc.validate('')).toBeNull();
    expect(await svc.validate('a'.repeat(1000))).toBeNull();
  });

  it('validate: rejects an expired session, from the cache and from Postgres', async () => {
    const user = await createUser();
    const token = await svc.create(user.id, req);
    await svc.validate(token); // cached
    advance(30 * DAY + 1);
    expect(await svc.validate(token)).toBeNull();
    await redis.flushdb();
    expect(await svc.validate(token)).toBeNull();
    // An expired session is not resurrected by the slide.
    const row = await prisma.client.session.findUnique({
      where: { tokenHash: crypto.sha256(token) },
    });
    expect(row === null || row.expiresAt <= now).toBe(true);
  });

  it('validate: rejects a soft-deleted user immediately, even with a cached session', async () => {
    const user = await createUser();
    const token = await svc.create(user.id, req);
    await svc.validate(token);
    await prisma.client.user.update({ where: { id: user.id }, data: { deletedAt: now } });
    expect(await svc.validate(token)).toBeNull();
    await redis.flushdb();
    expect(await svc.validate(token)).toBeNull();
  });

  it('validate: slides expiresAt and lastSeenAt at most once per hour', async () => {
    const user = await createUser();
    const token = await svc.create(user.id, req);
    const read = () =>
      prisma.client.session.findUniqueOrThrow({ where: { tokenHash: crypto.sha256(token) } });

    advance(30 * MINUTE);
    await svc.validate(token);
    expect((await read()).lastSeenAt).toEqual(T0);
    expect((await read()).expiresAt).toEqual(new Date(T0.getTime() + 30 * DAY));

    advance(31 * MINUTE); // 61 min after last slide (served from cache)
    const slidAt = now;
    const ctx = await svc.validate(token);
    expect(ctx?.session.lastSeenAt).toEqual(slidAt);
    expect((await read()).lastSeenAt).toEqual(slidAt);
    expect((await read()).expiresAt).toEqual(new Date(slidAt.getTime() + 30 * DAY));
    expect(JSON.parse((await redis.get(cacheKey(token)))!).lastSeenAt).toBe(slidAt.toISOString());

    advance(59 * MINUTE);
    await svc.validate(token);
    await redis.flushdb();
    await svc.validate(token);
    expect((await read()).lastSeenAt).toEqual(slidAt);

    advance(2 * MINUTE);
    await svc.validate(token);
    expect((await read()).lastSeenAt).toEqual(now);
  });

  it('revoke: deletes the session row and its cache key', async () => {
    const user = await createUser();
    const token = await svc.create(user.id, req);
    const other = await svc.create(user.id, req);
    await svc.validate(token);
    await svc.revoke(token);
    expect(await redis.exists(cacheKey(token))).toBe(0);
    expect(await svc.validate(token)).toBeNull();
    expect(await prisma.client.session.count()).toBe(1);
    expect(await svc.validate(other)).not.toBeNull();
    await expect(svc.revoke('unknown')).resolves.toBeUndefined();
  });

  it('revokeAllForUser: deletes every session of that user and clears their cache keys', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const a1 = await svc.create(alice.id, req);
    const a2 = await svc.create(alice.id, req);
    const b1 = await svc.create(bob.id, req);
    for (const t of [a1, a2, b1]) await svc.validate(t);

    await svc.revokeAllForUser(alice.id);

    expect(await redis.exists(cacheKey(a1), cacheKey(a2))).toBe(0);
    expect(await redis.exists(cacheKey(b1))).toBe(1);
    expect(await prisma.client.session.count({ where: { userId: alice.id } })).toBe(0);
    expect(await svc.validate(a1)).toBeNull();
    expect(await svc.validate(a2)).toBeNull();
    expect((await svc.validate(b1))?.user.id).toBe(bob.id);
  });

  it('revokeAllForUser: a session validated concurrently with the revocation keeps no cache key', async () => {
    const alice = await createUser();
    const token = await svc.create(alice.id, req); // exists in the DB, not cached yet
    const realSet = redis.set.bind(redis) as (...args: unknown[]) => Promise<unknown>;
    // The revocation lands right before validate()'s cache write.
    vi.spyOn(redis, 'set').mockImplementationOnce((async (...args: unknown[]) => {
      await svc.revokeAllForUser(alice.id);
      return realSet(...args);
    }) as never);

    expect(await svc.validate(token)).toBeNull();

    expect(await redis.exists(cacheKey(token))).toBe(0);
    expect(await prisma.client.session.count({ where: { userId: alice.id } })).toBe(0);
  });

  it('rotate: issues a new token for the same user and revokes the old one', async () => {
    const user = await createUser();
    const old = await svc.create(user.id, req);
    await svc.validate(old);
    const fresh = await svc.rotate(old, req);
    expect(fresh).not.toBe(old);
    expect(await redis.exists(cacheKey(old))).toBe(0);
    expect(await svc.validate(old)).toBeNull();
    expect((await svc.validate(fresh))?.user.id).toBe(user.id);
    expect(await prisma.client.session.count()).toBe(1);
  });

  it('rotate: rejects an invalid or expired token with UNAUTHENTICATED', async () => {
    await expect(svc.rotate('nope', req)).rejects.toMatchObject({
      code: ErrorCode.UNAUTHENTICATED,
      status: 401,
    });
    const user = await createUser();
    const token = await svc.create(user.id, req);
    advance(31 * DAY);
    await expect(svc.rotate(token, req)).rejects.toBeInstanceOf(DomainError);
    expect(await prisma.client.session.count({ where: { expiresAt: { gt: now } } })).toBe(0);
  });

  it('revoke: emits SessionRevokedEvent for the revoked session only (none for unknown tokens)', async () => {
    const user = await createUser();
    const token = await svc.create(user.id, req);
    const session = (await svc.validate(token))!.session;
    await svc.revoke(token);
    await svc.revoke(token);
    await svc.revoke('unknown');
    expect(revoked).toEqual([
      new SessionRevokedEvent({ userId: user.id, sessionId: session.id, all: false }),
    ]);
  });

  it('revokeAllForUser: emits one SessionRevokedEvent with all: true', async () => {
    const user = await createUser();
    await svc.create(user.id, req);
    await svc.create(user.id, req);
    await svc.revokeAllForUser(user.id);
    expect(revoked).toEqual([new SessionRevokedEvent({ userId: user.id, all: true })]);
  });

  it('revokeAllForUserInTx: deletes inside the transaction; cache and event wait for afterCommit', async () => {
    const user = await createUser();
    const token = await svc.create(user.id, req);
    await svc.validate(token);

    const afterCommit = await prisma.client.$transaction(async (tx) => {
      const done = await svc.revokeAllForUserInTx(tx, user.id);
      expect(revoked).toEqual([]);
      return done;
    });
    expect(await prisma.client.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await redis.exists(cacheKey(token))).toBe(1);

    await afterCommit();
    expect(await redis.exists(cacheKey(token))).toBe(0);
    expect(revoked).toEqual([new SessionRevokedEvent({ userId: user.id, all: true })]);
  });

  it('revokeAllForUserInTx: a rolled-back transaction keeps the sessions', async () => {
    const user = await createUser();
    const token = await svc.create(user.id, req);
    await expect(
      prisma.client.$transaction(async (tx) => {
        await svc.revokeAllForUserInTx(tx, user.id);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect((await svc.validate(token))?.user.id).toBe(user.id);
  });

  it('rotate: emits SessionRevokedEvent for the old session', async () => {
    const user = await createUser();
    const old = await svc.create(user.id, req);
    const oldId = (await svc.validate(old))!.session.id;
    await svc.rotate(old, req);
    expect(revoked).toEqual([
      new SessionRevokedEvent({ userId: user.id, sessionId: oldId, all: false }),
    ]);
  });
});
