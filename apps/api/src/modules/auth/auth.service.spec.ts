import { Logger } from '@nestjs/common';
import { ErrorCode } from '@kora/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../common/errors/domain-error';
import { AuthService } from './auth.service';
import type { PasswordService } from './password.service';

const flush = () => new Promise((resolve) => setImmediate(resolve));

/** An AuthService whose user lookup finds nobody and whose first hash() rejects. */
function serviceWithFlakyHash() {
  const passwords = {
    hash: vi
      .fn<PasswordService['hash']>()
      .mockRejectedValueOnce(new Error('out of memory'))
      .mockResolvedValue('$argon2id$dummy'),
    verify: vi.fn<PasswordService['verify']>().mockResolvedValue(false),
  };
  const prisma = { client: { user: { findFirst: vi.fn().mockResolvedValue(null) } } };
  const none = {} as never;
  const service = new AuthService(
    prisma as never,
    none,
    none,
    passwords as unknown as PasswordService,
    none,
    none,
    none,
    none,
  );
  return { service, passwords };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AuthService dummy hash', () => {
  it('logs a failed warm-up and retries the hash on the next unknown-email login', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service, passwords } = serviceWithFlakyHash();

    service.onModuleInit();
    await flush();
    expect(logged).toHaveBeenCalledTimes(1);

    const attempt = service.login(
      { email: 'nobody@example.com', password: 'x' },
      {} as never,
      {} as never,
    );
    await expect(attempt).rejects.toEqual(new DomainError(ErrorCode.UNAUTHENTICATED, 401));
    expect(passwords.hash).toHaveBeenCalledTimes(2);
    expect(passwords.verify).toHaveBeenCalledWith('$argon2id$dummy', 'x');
  });
});
