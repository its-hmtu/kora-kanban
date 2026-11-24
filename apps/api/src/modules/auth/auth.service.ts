import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
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
import { VerificationService } from './verification.service';

/** Hashed once (same argon2 parameters) so a login for a missing user costs a real verify. */
const DUMMY_PASSWORD = 'kora-dummy-password-for-timing';

const emailTaken = () =>
  new DomainError(ErrorCode.VALIDATION, 422, { fieldErrors: { email: ['EMAIL_TAKEN'] } });
const tokenInvalid = () =>
  new DomainError(ErrorCode.VALIDATION, 422, { fieldErrors: { token: ['TOKEN_INVALID'] } });
const unauthenticated = () => new DomainError(ErrorCode.UNAUTHENTICATED, 401);

/** Email/password accounts (US1): sign-up, sign-in, sign-out, email verification, reset. */
@Injectable()
export class AuthService implements OnModuleInit {
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
    void this.getDummyHash(); // warm up so even the first unknown-email login takes full time
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
    await this.signIn(user.id, req, res);
    return user;
  }

  /**
   * Starts a session for `userId`: ends any session the browser already carried, sets a new
   * `kora_sid` and issues a fresh CSRF token (both defend against fixation). Every sign-in path
   * (password, OAuth) must go through here.
   */
  async signIn(userId: string, req: Request, res: Response): Promise<void> {
    const previous: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof previous === 'string' && previous !== '') await this.sessions.revoke(previous);
    const token = await this.sessions.create(userId, req);
    this.sessions.setSessionCookie(res, token);
    this.csrfTokens.issue(res);
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

  /** Always succeeds (no account enumeration); emails a reset link when the account exists. */
  async forgotPassword({ email }: ForgotInput): Promise<void> {
    const user = await this.prisma.client.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, email: true, name: true, locale: true },
    });
    if (!user) return;
    const token = await this.verifications.issue(user.id, 'password_reset');
    await this.mail.send({
      to: user.email,
      template: 'reset-password',
      props: { name: user.name, url: this.link('/reset-password', token) },
      locale: resolveLocale(user.locale, undefined),
    });
  }

  /** Sets a new password and signs out every session. Does not sign in. */
  async resetPassword({ token, password }: ResetInput): Promise<void> {
    // Check the password first so a rejected one does not spend the token.
    await this.passwords.assertNotBreached(password);
    const passwordHash = await this.passwords.hash(password);
    const { userId } = await this.verifications.consume(token, 'password_reset');
    const updated = await this.prisma.client.user.updateMany({
      where: { id: userId, deletedAt: null },
      data: { passwordHash },
    });
    if (updated.count !== 1) throw tokenInvalid();
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

  private clearCookies(res: Response): void {
    this.sessions.clearSessionCookie(res);
    this.csrfTokens.clear(res);
  }

  /** Spends one argon2 verify (as a real attempt would), then fails like a wrong password. */
  private async rejectLogin(password: string): Promise<never> {
    await this.passwords.verify(await this.getDummyHash(), password);
    throw unauthenticated();
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash(DUMMY_PASSWORD);
    return this.dummyHash;
  }
}
