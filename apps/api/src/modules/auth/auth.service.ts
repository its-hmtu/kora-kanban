import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  ErrorCode,
  type ForgotInput,
  type LoginInput,
  type RegisterInput,
  type ResetInput,
} from '@kora/shared';
import type { Request, Response } from 'express';
import { DomainError } from '../../common/errors/domain-error';
import { resolveLocale } from '../../common/i18n/messages';
import { APP_CONFIG } from '../../infra/config/config.module';
import type { Env } from '../../infra/config/env';
import { MailService } from '../../infra/mail/mail.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AUTH_USER_SELECT, type AuthUser } from './auth.types';
import { CsrfTokenService } from './csrf-token.service';
import { PasswordService } from './password.service';
import { CLOCK, SESSION_COOKIE, SessionService, type Clock } from './session.service';
import { tokenInvalid, VerificationService } from './verification.service';

/** Hashed once (same argon2 parameters) so a login for a missing user costs a real verify. */
const DUMMY_PASSWORD = 'kora-dummy-password-for-timing';

const emailTaken = () =>
  new DomainError(ErrorCode.VALIDATION, 422, { fieldErrors: { email: ['EMAIL_TAKEN'] } });
const unauthenticated = () => new DomainError(ErrorCode.UNAUTHENTICATED, 401);

/** Email/password accounts (US1): sign-up, sign-in, sign-out, email verification, reset. */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly csrfTokens: CsrfTokenService,
    private readonly passwords: PasswordService,
    private readonly verifications: VerificationService,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    // Warm up so even the first unknown-email login takes full time; a failure is retried later.
    this.getDummyHash().catch((error: unknown) => {
      this.logger.error({ err: error }, 'Precomputing the dummy password hash failed');
    });
  }

  /** Creates the account, signs it in and sends the verification email. */
  async register(input: RegisterInput, req: Request, res: Response): Promise<AuthUser> {
    await this.passwords.assertNotBreached(input.password);
    if (await this.prisma.client.user.findUnique({ where: { email: input.email } })) {
      throw emailTaken();
    }
    const passwordHash = await this.passwords.hash(input.password);
    let user: AuthUser;
    try {
      user = await this.prisma.client.user.create({
        data: { email: input.email, name: input.name, passwordHash },
        select: AUTH_USER_SELECT,
      });
    } catch (error) {
      // A concurrent sign-up with the same email won the unique index.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw emailTaken();
      }
      throw error;
    }
    await this.sendVerifyEmail(user);
    await this.signIn(user.id, req, res);
    return user;
  }

  /**
   * Unknown email, deleted account, password-less (OAuth-only) account and wrong password all
   * fail identically; a missing user still pays for an argon2 verify so timing doesn't tell.
   */
  async login(input: LoginInput, req: Request, res: Response): Promise<AuthUser> {
    const found = await this.prisma.client.user.findFirst({
      where: { email: input.email, deletedAt: null },
      select: { ...AUTH_USER_SELECT, passwordHash: true },
    });
    if (!found) return this.rejectLogin(input.password);
    const { passwordHash, ...user } = found;
    if (!passwordHash) return this.rejectLogin(input.password);
    if (!(await this.passwords.verify(passwordHash, input.password))) throw unauthenticated();

    const token = await this.startSession(user.id, req);
    // A reset, password change, OAuth takeover or deletion may have revoked every session after
    // we verified the old hash but before our row existed. Each one changes the user row and then
    // deletes sessions. FOR SHARE waits for a revoker whose transaction is still open (the OAuth
    // takeover does both in one transaction, so our row escaped its DELETE) and reads the row as
    // it committed; a revoker that has not written yet will still delete our row.
    const [current] = await this.prisma.client.$queryRaw<
      { passwordHash: string | null; deletedAt: Date | null }[]
    >`SELECT "passwordHash", "deletedAt" FROM "User" WHERE "id" = ${user.id}::uuid FOR SHARE`;
    if (current?.passwordHash !== passwordHash || current.deletedAt) {
      await this.sessions.revoke(token);
      throw unauthenticated();
    }
    this.setSignInCookies(res, token);
    return user;
  }

  /**
   * Starts a session for `userId`: ends any session the browser already carried, sets a new
   * `kora_sid` and issues a fresh CSRF token (both defend against fixation). Every sign-in path
   * (password, OAuth) and session rotation (password change) must go through here.
   */
  async signIn(userId: string, req: Request, res: Response): Promise<void> {
    this.setSignInCookies(res, await this.startSession(userId, req));
  }

  /** Ends the current session and clears the session and CSRF cookies. */
  async logout(req: Request, res: Response): Promise<void> {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') await this.sessions.revoke(token);
    this.clearCookies(res);
  }

  /** Ends every session of the user (SessionService emits SessionRevokedEvent for sockets). */
  async logoutAll(userId: string, res: Response): Promise<void> {
    await this.sessions.revokeAllForUser(userId);
    this.clearCookies(res);
  }

  /** Marks the email verified; keeps the first timestamp if it already was. */
  async verifyEmail(token: string): Promise<void> {
    const { userId } = await this.verifications.consume(token, 'email_verify');
    await this.prisma.client.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: this.clock.now() },
    });
  }

  /** Emails a fresh verification link to a signed-in, still unverified user; no-op otherwise. */
  async resendVerification(user: AuthUser): Promise<void> {
    if (user.emailVerifiedAt) return;
    await this.sendVerifyEmail(user);
  }

  /**
   * Always succeeds (no account enumeration); emails a reset link when the account exists. A
   * failure to issue or enqueue is logged, not surfaced: a 500 only for real accounts would leak.
   */
  async forgotPassword({ email }: ForgotInput): Promise<void> {
    const user = await this.prisma.client.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, email: true, name: true, locale: true },
    });
    if (!user) return;
    try {
      const token = await this.verifications.issue(user.id, 'password_reset');
      await this.mail.send({
        to: user.email,
        template: 'reset-password',
        props: { name: user.name, url: this.link('/reset-password', token) },
        locale: resolveLocale(user.locale, undefined),
      });
    } catch (error) {
      this.logger.error({ err: error, userId: user.id }, 'Sending the password reset email failed');
    }
  }

  /**
   * Sets a new password, marks the email verified (the link proved inbox control) and signs out
   * every session. Does not sign in.
   */
  async resetPassword({ token, password }: ResetInput): Promise<void> {
    // Check the password first so a rejected one does not spend the token, but hash only after
    // the token is accepted so invalid tokens cannot buy anonymous argon2 work.
    await this.passwords.assertNotBreached(password);
    const { userId } = await this.verifications.consume(token, 'password_reset');
    const passwordHash = await this.passwords.hash(password);
    const now = this.clock.now();
    const updated = await this.prisma.client.$transaction([
      this.prisma.client.user.updateMany({
        where: { id: userId, deletedAt: null },
        data: { passwordHash },
      }),
      this.prisma.client.user.updateMany({
        where: { id: userId, deletedAt: null, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      }),
    ]);
    if (updated[0].count !== 1) throw tokenInvalid();
    await this.sessions.revokeAllForUser(userId);
  }

  private async sendVerifyEmail(user: AuthUser): Promise<void> {
    const token = await this.verifications.issue(user.id, 'email_verify');
    await this.mail.send({
      to: user.email,
      template: 'verify-email',
      props: { name: user.name, url: this.link('/verify-email', token) },
      locale: resolveLocale(user.locale, undefined),
    });
  }

  private link(path: string, token: string): string {
    return `${this.config.APP_URL.replace(/\/+$/, '')}${path}?token=${encodeURIComponent(token)}`;
  }

  /** Ends the session the browser already carried (fixation) and creates a new one. */
  private async startSession(userId: string, req: Request): Promise<string> {
    const previous: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof previous === 'string' && previous !== '') await this.sessions.revoke(previous);
    return this.sessions.create(userId, req);
  }

  private setSignInCookies(res: Response, token: string): void {
    this.sessions.setSessionCookie(res, token);
    this.csrfTokens.issue(res);
  }

  private clearCookies(res: Response): void {
    this.sessions.clearSessionCookie(res);
    this.csrfTokens.clear(res);
  }

  /** Spends one argon2 verify (as a real attempt would), then fails like a wrong password. */
  private async rejectLogin(password: string): Promise<never> {
    await this.passwords.verify(await this.getDummyHash(), password);
    throw unauthenticated();
  }

  /** Cached; a rejected hash is dropped from the cache so the next login retries it. */
  private getDummyHash(): Promise<string> {
    if (!this.dummyHash) {
      const pending = this.passwords.hash(DUMMY_PASSWORD);
      this.dummyHash = pending;
      pending.catch(() => {
        if (this.dummyHash === pending) this.dummyHash = undefined;
      });
    }
    return this.dummyHash;
  }
}
