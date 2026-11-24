import { ErrorCode } from '@kora/shared';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../common/errors/domain-error';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('hashes with Argon2id at 19 MiB / 2 iterations / parallelism 1 and verifies', async () => {
    const hash = await svc.hash('correct-horse-battery');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await svc.verify(hash, 'correct-horse-battery')).toBe(true);
    expect(await svc.verify(hash, 'wrong-password-here')).toBe(false);
  });

  it('salts: hashing the same password twice gives different hashes', async () => {
    expect(await svc.hash('same-password-1')).not.toBe(await svc.hash('same-password-1'));
  });

  it('verify returns false (does not throw) for a malformed hash', async () => {
    expect(await svc.verify('not-a-hash', 'whatever')).toBe(false);
    expect(await svc.verify('', 'whatever')).toBe(false);
  });

  it('isBreached matches the common list case-insensitively', async () => {
    expect(await svc.isBreached('password')).toBe(true);
    expect(await svc.isBreached('PassWord')).toBe(true);
    expect(await svc.isBreached('qwertyuiop')).toBe(true);
    expect(await svc.isBreached('zk3-Vq9!unlikely-passphrase-77')).toBe(false);
  });

  it('assertNotBreached throws a 422 VALIDATION DomainError for a breached password', async () => {
    const err = await svc.assertNotBreached('password').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toMatchObject({
      code: ErrorCode.VALIDATION,
      status: 422,
      details: { fieldErrors: { password: ['PASSWORD_BREACHED'] } },
    });
  });

  it('assertNotBreached resolves for an unbreached password', async () => {
    await expect(svc.assertNotBreached('zk3-Vq9!unlikely-passphrase-77')).resolves.toBeUndefined();
  });
});
