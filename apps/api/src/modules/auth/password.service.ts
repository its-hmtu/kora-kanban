import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { ErrorCode } from '@kora/shared';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DomainError } from '../../common/errors/domain-error';

/** Argon2id (the library default; `Algorithm` is an ambient const enum, unusable under isolatedModules). OWASP minimum: 19 MiB memory, 2 iterations, 1 lane. */
const ARGON2_OPTIONS = {
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

const COMMON_PASSWORDS_FILE = join(__dirname, 'data', 'common-passwords.txt');

@Injectable()
export class PasswordService {
  private common?: Promise<Set<string>>;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  /** Returns false (never throws) for a wrong password or a malformed hash. */
  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  /** Async because the top-10k list is lazily read from disk once, then cached. Case-insensitive. */
  async isBreached(password: string): Promise<boolean> {
    return (await this.loadCommon()).has(password.toLowerCase());
  }

  /** Throws a 422 `PASSWORD_BREACHED` error on `field` when the password is in the common list. */
  async assertNotBreached(password: string, field = 'password'): Promise<void> {
    if (await this.isBreached(password)) {
      throw new DomainError(ErrorCode.VALIDATION, 422, {
        fieldErrors: { [field]: ['PASSWORD_BREACHED'] },
      });
    }
  }

  private loadCommon(): Promise<Set<string>> {
    this.common ??= readFile(COMMON_PASSWORDS_FILE, 'utf8')
      .then(
        (text) =>
          new Set(
            text
              .split(/\r?\n/)
              .map((line) => line.trim().toLowerCase())
              .filter(Boolean),
          ),
      )
      .catch((error: unknown) => {
        this.common = undefined; // do not cache a failed load
        throw error;
      });
    return this.common;
  }
}
