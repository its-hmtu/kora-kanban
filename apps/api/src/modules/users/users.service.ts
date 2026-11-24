import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode, type ChangePasswordInput, type Locale, type UpdateMeInput } from '@kora/shared';
import type { Request, Response } from 'express';
import { DomainError } from '../../common/errors/domain-error';
import type { Locale as DbLocale, OAuthProvider, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AUTH_USER_SELECT } from '../auth/auth.types';
import { PasswordService } from '../auth/password.service';
import { CLOCK, SessionService, type Clock } from '../auth/session.service';

const ME_SELECT = {
  ...AUTH_USER_SELECT,
  avatarUrl: true,
  passwordHash: true,
} satisfies Prisma.UserSelect;

/** `GET /me` body. `workspaces` stays empty until US2. */
export interface MeResponse {
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    locale: Locale;
    theme: 'light' | 'dark' | 'system';
    timezone: string;
    emailVerifiedAt: Date | null;
    hasPassword: boolean;
  };
  providers: OAuthProvider[];
  workspaces: never[];
}

const currentPasswordError = (code: 'PASSWORD_INCORRECT' | 'PASSWORD_NOT_SET') =>
  new DomainError(ErrorCode.VALIDATION, 422, { fieldErrors: { currentPassword: [code] } });

// The DB enum is identifier-safe (`zh_CN`); the API speaks the app-level ids (`zh-CN`).
const toDbLocale = (locale: Locale) => locale.replace('-', '_') as DbLocale;
const fromDbLocale = (locale: DbLocale) => locale.replace('_', '-') as Locale;

/** The signed-in user's own account (`/me`, US1). */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async getMe(userId: string): Promise<MeResponse> {
    const [user, accounts] = await Promise.all([
      this.prisma.client.user.findFirstOrThrow({
        where: { id: userId, deletedAt: null },
        select: ME_SELECT,
      }),
      this.prisma.client.oAuthAccount.findMany({
        where: { userId },
        select: { provider: true },
      }),
    ]);
    const { passwordHash, locale, ...profile } = user;
    return {
      user: { ...profile, locale: fromDbLocale(locale), hasPassword: passwordHash !== null },
      providers: [...new Set(accounts.map((a) => a.provider))].sort(),
      workspaces: [],
    };
  }

  /**
   * Sessions cache only the session row; the session guard re-reads the user on every request,
   * so the change is visible to the next request without touching the session cache.
   */
  async updateMe(userId: string, input: UpdateMeInput): Promise<MeResponse> {
    const { locale, ...rest } = input;
    await this.prisma.client.user.update({
      where: { id: userId, deletedAt: null },
      data: { ...rest, ...(locale && { locale: toDbLocale(locale) }) },
    });
    return this.getMe(userId);
  }

  /**
   * Verifies the current password, stores the new one (only if the hash is still the verified
   * one), signs out every session and gives this browser a new session and CSRF token.
   */
  async changePassword(
    userId: string,
    { currentPassword, newPassword }: ChangePasswordInput,
    req: Request,
    res: Response,
  ): Promise<void> {
    const { passwordHash } = await this.prisma.client.user.findFirstOrThrow({
      where: { id: userId, deletedAt: null },
      select: { passwordHash: true },
    });
    if (!passwordHash) throw currentPasswordError('PASSWORD_NOT_SET');
    if (!(await this.passwords.verify(passwordHash, currentPassword))) {
      throw currentPasswordError('PASSWORD_INCORRECT');
    }
    await this.passwords.assertNotBreached(newPassword, 'newPassword');
    const updated = await this.prisma.client.user.updateMany({
      where: { id: userId, deletedAt: null, passwordHash },
      data: { passwordHash: await this.passwords.hash(newPassword) },
    });
    // Changed concurrently (reset, OAuth takeover, another change): the verified password is stale.
    if (updated.count !== 1) throw currentPasswordError('PASSWORD_INCORRECT');
    await this.sessions.revokeAllForUser(userId);
    await this.auth.signIn(userId, req, res);
  }

  /**
   * Soft delete that frees the email: in one transaction marks the user deleted, scrubs the email
   * to an unroutable placeholder, drops the password, verification state, linked OAuth accounts
   * and unused tokens, so the address (or provider account) can sign up again as a new user.
   * Then revokes every session and clears the cookies.
   */
  async deleteMe(userId: string, res: Response): Promise<void> {
    // TODO(US2): block when the user is the sole Owner of a workspace.
    await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId, deletedAt: null },
        data: {
          deletedAt: this.clock.now(),
          email: `deleted+${userId}@deleted.invalid`,
          passwordHash: null,
          emailVerifiedAt: null,
        },
      });
      await tx.oAuthAccount.deleteMany({ where: { userId } });
      await tx.verificationToken.deleteMany({ where: { userId, usedAt: null } });
    });
    await this.auth.logoutAll(userId, res);
  }
}
