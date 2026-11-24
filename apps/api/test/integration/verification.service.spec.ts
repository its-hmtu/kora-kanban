import { ErrorCode } from '@kora/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../../src/common/errors/domain-error';
import { loadEnv } from '../../src/infra/config/env';
import { CryptoService } from '../../src/infra/crypto/crypto.service';
import type { PrismaService } from '../../src/infra/prisma/prisma.service';
import { VerificationService } from '../../src/modules/auth/verification.service';
import { createUser } from '../setup/factories';
import { closeHarness, getPrisma, resetDb } from '../setup/test-app';

const HOUR = 60 * 60_000;
const T0 = new Date('2026-03-01T10:00:00.000Z');
const invalid = {
  code: ErrorCode.VALIDATION,
  status: 422,
  details: { fieldErrors: { token: ['TOKEN_INVALID'] } },
};

describe('VerificationService (real Postgres)', () => {
  let prisma: PrismaService;
  let crypto: CryptoService;
  let svc: VerificationService;
  let now: Date;
  const advance = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };

  beforeAll(async () => {
    prisma = await getPrisma();
    crypto = new CryptoService(loadEnv());
    svc = new VerificationService(prisma, crypto, { now: () => now });
  });
  beforeEach(async () => {
    await resetDb();
    now = T0;
  });
  afterAll(closeHarness);

  it('stores only the sha256 hash with a 24 h expiry for email_verify', async () => {
    const user = await createUser();
    const token = await svc.issue(user.id, 'email_verify');
    const rows = await prisma.client.verificationToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: user.id,
      type: 'email_verify',
      tokenHash: crypto.sha256(token),
      usedAt: null,
    });
    expect(rows[0]?.tokenHash).not.toBe(token);
    expect(rows[0]?.expiresAt.getTime()).toBe(T0.getTime() + 24 * HOUR);
  });

  it('uses a 1 h expiry for password_reset', async () => {
    const user = await createUser();
    await svc.issue(user.id, 'password_reset');
    const row = await prisma.client.verificationToken.findFirstOrThrow();
    expect(row.expiresAt.getTime()).toBe(T0.getTime() + HOUR);
  });

  it('consume returns the userId and marks the token used; second use is rejected', async () => {
    const user = await createUser();
    const token = await svc.issue(user.id, 'email_verify');
    expect(await svc.consume(token, 'email_verify')).toEqual({ userId: user.id });
    const row = await prisma.client.verificationToken.findFirstOrThrow();
    expect(row.usedAt?.getTime()).toBe(T0.getTime());
    await expect(svc.consume(token, 'email_verify')).rejects.toMatchObject(invalid);
  });

  it('rejects expired tokens at the exact expiry instant, accepts just before', async () => {
    const user = await createUser();
    const a = await svc.issue(user.id, 'password_reset');
    advance(HOUR - 1);
    expect(await svc.consume(a, 'password_reset')).toEqual({ userId: user.id });
    const b = await svc.issue(user.id, 'password_reset');
    advance(HOUR);
    await expect(svc.consume(b, 'password_reset')).rejects.toMatchObject(invalid);
  });

  it('rejects unknown tokens and wrong-type tokens with the same DomainError', async () => {
    const user = await createUser();
    const token = await svc.issue(user.id, 'email_verify');
    const err = await svc.consume(token, 'password_reset').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toMatchObject(invalid);
    await expect(svc.consume('nope-nope-nope', 'email_verify')).rejects.toMatchObject(invalid);
    // wrong-type attempt must not burn the token
    expect(await svc.consume(token, 'email_verify')).toEqual({ userId: user.id });
  });

  it('issuing a new token invalidates previous unused tokens of the same user and type only', async () => {
    const user = await createUser();
    const other = await createUser();
    const first = await svc.issue(user.id, 'password_reset');
    const verify = await svc.issue(user.id, 'email_verify');
    const otherUser = await svc.issue(other.id, 'password_reset');
    const second = await svc.issue(user.id, 'password_reset');
    await expect(svc.consume(first, 'password_reset')).rejects.toMatchObject(invalid);
    expect(await svc.consume(second, 'password_reset')).toEqual({ userId: user.id });
    expect(await svc.consume(verify, 'email_verify')).toEqual({ userId: user.id });
    expect(await svc.consume(otherUser, 'password_reset')).toEqual({ userId: other.id });
  });

  it('lets exactly one of many concurrent consumes succeed', async () => {
    const user = await createUser();
    const token = await svc.issue(user.id, 'password_reset');
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => svc.consume(token, 'password_reset')),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((r) => r.status === 'rejected')) {
      expect(r).toMatchObject({ reason: invalid });
    }
  });
});
