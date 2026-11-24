import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ErrorCode } from '@kora/shared';
import type { CookieOptions, Request, Response } from 'express';
import type { Redis } from 'ioredis';
import { DomainError } from '../../common/errors/domain-error';
import { APP_CONFIG } from '../../infra/config/config.module';
import type { Env } from '../../infra/config/env';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { REDIS } from '../../infra/redis/redis.module';
import { AUTH_USER_SELECT, type AuthContext, type SessionInfo } from './auth.types';
import { SESSION_REVOKED_EVENT, SessionRevokedEvent } from './session-revoked.event';

export const SESSION_COOKIE = 'kora_sid';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_SLIDE_INTERVAL_MS = 60 * 60 * 1000;
export const SESSION_CACHE_TTL_SECONDS = 60;
const TOKEN_BYTES = 32; // 256-bit
const MAX_TOKEN_LENGTH = 128; // a real token is 43 chars; don't hash arbitrary junk

/** Injectable time source so expiry and sliding can be tested deterministically. */
export const CLOCK = Symbol('CLOCK');
export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };

export type SessionRequestInfo = Pick<Request, 'headers' | 'ip'>;

interface CachedSession {
  id: string;
  userId: string;
  expiresAt: string;
  lastSeenAt: string;
}

/**
 * Server-side sessions (research A10). The raw token only ever goes to the cookie; Postgres and
 * Redis are keyed by its SHA-256. Lookups are cached in Redis for 60 s; the user row is always
 * re-read so deleted users are rejected immediately.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly crypto: CryptoService,
    @Inject(APP_CONFIG) private readonly config: Env,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: EventEmitter2,
  ) {}

  /** Creates a session and returns the raw token (for the cookie only). */
  async create(userId: string, req: SessionRequestInfo): Promise<string> {
    const token = this.crypto.randomToken(TOKEN_BYTES);
    const now = this.clock.now();
    await this.prisma.client.session.create({
      data: {
        userId,
        tokenHash: this.crypto.sha256(token),
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        lastSeenAt: now,
        userAgent: req.headers['user-agent'] ?? null,
        ip: req.ip ?? null,
      },
    });
    return token;
  }

  /** Resolves a raw token to its session and user, or null if unknown/expired/user deleted. */
  async validate(token: string): Promise<AuthContext | null> {
    if (!token || token.length > MAX_TOKEN_LENGTH) return null;
    const hash = this.crypto.sha256(token);
    const now = this.clock.now();

    let session = await this.readCache(hash);
    const fromCache = session !== null;
    if (!session) {
      const row = await this.prisma.client.session.findUnique({
        where: { tokenHash: hash },
        select: { id: true, userId: true, expiresAt: true, lastSeenAt: true },
      });
      if (!row) return null;
      session = row;
    }

    if (session.expiresAt <= now) {
      await this.removeByHashes([hash]);
      return null;
    }

    const user = await this.prisma.client.user.findFirst({
      where: { id: session.userId, deletedAt: null },
      select: AUTH_USER_SELECT,
    });
    if (!user) {
      await this.redis.del(this.cacheKey(hash));
      return null;
    }

    const refreshed = now.getTime() - session.lastSeenAt.getTime() >= SESSION_SLIDE_INTERVAL_MS;
    if (refreshed) {
      session = {
        ...session,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      };
      await this.prisma.client.session.updateMany({
        where: { id: session.id },
        data: { lastSeenAt: session.lastSeenAt, expiresAt: session.expiresAt },
      });
    }

    // Only (re)cache after a DB read or a slide: a plain hit must not extend the 60 s TTL, so an
    // out-of-band delete is honoured within 60 s.
    if (!fromCache || refreshed) {
      await this.writeCache(hash, session);
      // A revoke may have landed between our read and the cache write; re-check so it isn't
      // resurrected by the entry we just wrote.
      const stillExists = await this.prisma.client.session.findUnique({
        where: { tokenHash: hash },
        select: { id: true },
      });
      if (!stillExists) {
        await this.redis.del(this.cacheKey(hash));
        return null;
      }
    }
    return { session, user, refreshed };
  }

  /** Signs out one session and emits `SessionRevokedEvent`. Unknown tokens are ignored. */
  async revoke(token: string): Promise<void> {
    if (!token || token.length > MAX_TOKEN_LENGTH) return;
    const hash = this.crypto.sha256(token);
    // Row first, then cache key (see removeByHashes); RETURNING names the session for the event.
    const rows = await this.prisma.client.$queryRaw<{ id: string; userId: string }[]>`
      DELETE FROM "Session" WHERE "tokenHash" = ${hash} RETURNING "id", "userId"`;
    await this.redis.del(this.cacheKey(hash));
    for (const row of rows) {
      this.emitRevoked(
        new SessionRevokedEvent({ userId: row.userId, sessionId: row.id, all: false }),
      );
    }
  }

  /** "Sign out all devices": deletes every session of the user and their cache entries. */
  async revokeAllForUser(userId: string): Promise<void> {
    // Delete and collect atomically so a session created mid-revocation can't keep a cache key.
    const rows = await this.prisma.client.$queryRaw<{ tokenHash: string }[]>`
      DELETE FROM "Session" WHERE "userId" = ${userId}::uuid RETURNING "tokenHash"`;
    if (rows.length) await this.redis.del(...rows.map((r) => this.cacheKey(r.tokenHash)));
    this.emitRevoked(new SessionRevokedEvent({ userId, all: true }));
  }

  /** Replaces a valid session with a fresh one for the same user; returns the new raw token. */
  async rotate(oldToken: string, req: SessionRequestInfo): Promise<string> {
    const ctx = await this.validate(oldToken);
    if (!ctx) throw new DomainError(ErrorCode.UNAUTHENTICATED, 401);
    const token = await this.create(ctx.user.id, req);
    await this.revoke(oldToken);
    return token;
  }

  setSessionCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE, token, { ...this.cookieOptions(), maxAge: SESSION_TTL_MS });
  }

  clearSessionCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    };
  }

  /** Deletes rows first, then cache keys, so a concurrent miss cannot re-cache a deleted row. */
  private async removeByHashes(hashes: string[]): Promise<void> {
    await this.prisma.client.session.deleteMany({ where: { tokenHash: { in: hashes } } });
    await this.redis.del(...hashes.map((h) => this.cacheKey(h)));
  }

  private emitRevoked(event: SessionRevokedEvent): void {
    this.events.emit(SESSION_REVOKED_EVENT, event);
  }

  private cacheKey(hash: string): string {
    return `sess:${hash}`;
  }

  private async readCache(hash: string): Promise<SessionInfo | null> {
    const raw = await this.redis.get(this.cacheKey(hash));
    if (!raw) return null;
    const c = JSON.parse(raw) as CachedSession;
    return {
      id: c.id,
      userId: c.userId,
      expiresAt: new Date(c.expiresAt),
      lastSeenAt: new Date(c.lastSeenAt),
    };
  }

  private async writeCache(hash: string, s: SessionInfo): Promise<void> {
    const value: CachedSession = {
      id: s.id,
      userId: s.userId,
      expiresAt: s.expiresAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
    };
    await this.redis.set(
      this.cacheKey(hash),
      JSON.stringify(value),
      'EX',
      SESSION_CACHE_TTL_SECONDS,
    );
  }
}
