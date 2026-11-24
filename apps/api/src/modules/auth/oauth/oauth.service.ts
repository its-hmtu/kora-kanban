import { Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '@kora/shared';
import { generateCodeVerifier, generateState } from 'arctic';
import type { CookieOptions, Request, Response } from 'express';
import { DomainError } from '../../../common/errors/domain-error';
import { APP_CONFIG } from '../../../infra/config/config.module';
import type { Env } from '../../../infra/config/env';
import { CryptoService } from '../../../infra/crypto/crypto.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { AuthService } from '../auth.service';
import { CLOCK, SessionService, type Clock } from '../session.service';
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  OAUTH_COOKIE_TTL_MS,
  openOAuthCookie,
  safeNextPath,
  sealOAuthCookie,
} from './oauth-cookie';
import {
  OAUTH_PROVIDERS,
  OAuthCodeRejectedError,
  OAuthProviderClient,
  type OAuthProfile,
  type OAuthProvider,
} from './oauth-provider.client';

/** `?error=` values the web login page shows after a failed OAuth sign-in. */
export type OAuthLoginError = 'oauth_failed' | 'oauth_email_unverified';

type Resolution = { userId: string } | { error: OAuthLoginError };

const NAME_MAX = 100;

const notFound = () => new DomainError(ErrorCode.NOT_FOUND, 404);
/** State/PKCE/cookie problems: the request is not a callback for a flow this browser started. */
const badCallback = () => new DomainError(ErrorCode.VALIDATION, 400);

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** First 100 code points (never splits a surrogate pair). */
const truncate = (value: string) => Array.from(value).slice(0, NAME_MAX).join('');

/**
 * Google/GitHub sign-in (research B2, FR-002/FR-003): authorization-code flow with `state`
 * (+ PKCE where the provider supports it) carried in a signed `kora_oauth` cookie.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: OAuthProviderClient,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly crypto: CryptoService,
    @Inject(APP_CONFIG) private readonly config: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Stores the flow in the `kora_oauth` cookie; returns the provider URL to redirect to. */
  start(provider: string, next: unknown, res: Response): string {
    const p = this.enabledProvider(provider);
    const state = generateState();
    const codeVerifier = this.providers.usesPkce(p) ? generateCodeVerifier() : undefined;
    const url = this.providers.createAuthorizationUrl(p, state, codeVerifier);
    const cookie = sealOAuthCookie(
      {
        provider: p,
        state,
        codeVerifier,
        next: safeNextPath(next),
        exp: this.clock.now().getTime() + OAUTH_COOKIE_TTL_MS,
      },
      this.config.SESSION_SECRET,
    );
    res.cookie(OAUTH_COOKIE, cookie, { ...this.cookieOptions(), maxAge: OAUTH_COOKIE_TTL_MS });
    return url.toString();
  }

  /**
   * Completes the flow and returns where to redirect: the app (signed in) or the login page with
   * an `?error=`. Throws 400 when the callback does not match the flow in this browser's cookie
   * (state mismatch, missing/forged/expired cookie, or the provider rejecting the code/PKCE).
   */
  async callback(
    provider: string,
    query: Record<string, unknown>,
    req: Request,
    res: Response,
  ): Promise<string> {
    const p = this.enabledProvider(provider);
    const flow = openOAuthCookie(
      req.cookies?.[OAUTH_COOKIE],
      this.config.SESSION_SECRET,
      this.clock.now(),
    );
    res.clearCookie(OAUTH_COOKIE, this.cookieOptions()); // single use, whatever happens next

    if (query.error !== undefined) return this.loginError('oauth_failed');
    const { code, state } = query;
    if (
      !flow ||
      flow.provider !== p ||
      typeof state !== 'string' ||
      !this.crypto.timingSafeEqual(state, flow.state) ||
      typeof code !== 'string' ||
      code === ''
    ) {
      throw badCallback();
    }

    let profile: OAuthProfile;
    try {
      profile = await this.providers.fetchProfile(p, code, flow.codeVerifier);
    } catch (error) {
      if (error instanceof OAuthCodeRejectedError) {
        // Visible to operators: a persistent invalid_client means a misconfigured provider.
        this.logger.warn(`${p} code rejected: ${error.providerCode}`);
        throw badCallback();
      }
      this.logger.warn(
        `${p} sign-in failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return this.loginError('oauth_failed');
    }

    const result = await this.resolveUser(p, profile);
    if ('error' in result) return this.loginError(result.error);
    await this.auth.signIn(result.userId, req, res);
    return `${this.appUrl()}${flow.next ?? '/'}`;
  }

  /** Retries once when a concurrent first sign-in won a unique index (user email or account). */
  private async resolveUser(provider: OAuthProvider, profile: OAuthProfile): Promise<Resolution> {
    try {
      return await this.resolveUserOnce(provider, profile);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return this.resolveUserOnce(provider, profile);
    }
  }

  /**
   * In order: an existing link signs in (whatever the email flag says now); otherwise only a
   * provider-verified email is trusted, to link an existing account (FR-003) or create one. An
   * unverified existing account is taken over (pre-account-takeover defence): its password and
   * sessions — possibly an attacker's — are dropped.
   */
  private async resolveUserOnce(
    provider: OAuthProvider,
    profile: OAuthProfile,
  ): Promise<Resolution> {
    const now = this.clock.now();
    let afterCommit: (() => Promise<void>) | undefined;
    const result = await this.prisma.client.$transaction(async (tx): Promise<Resolution> => {
      const linked = await tx.oAuthAccount.findUnique({
        where: {
          provider_providerUserId: { provider, providerUserId: profile.providerUserId },
        },
        select: { user: { select: { id: true, deletedAt: true } } },
      });
      if (linked) {
        return linked.user.deletedAt ? { error: 'oauth_failed' } : { userId: linked.user.id };
      }

      const { email } = profile;
      if (!email || !profile.emailVerified) return { error: 'oauth_email_unverified' };
      const account = {
        provider,
        providerUserId: profile.providerUserId,
        email,
        emailVerified: true,
      };

      const existing = await tx.user.findUnique({
        where: { email },
        select: { id: true, deletedAt: true, emailVerifiedAt: true },
      });
      if (existing?.deletedAt) return { error: 'oauth_failed' };
      if (existing) {
        await tx.oAuthAccount.create({ data: { ...account, userId: existing.id } });
        if (!existing.emailVerifiedAt) {
          await tx.user.update({
            where: { id: existing.id },
            data: { emailVerifiedAt: now, passwordHash: null },
          });
          afterCommit = await this.sessions.revokeAllForUserInTx(tx, existing.id);
        }
        return { userId: existing.id };
      }

      const user = await tx.user.create({
        data: {
          email,
          name: truncate(profile.name || email.split('@')[0] || email),
          emailVerifiedAt: now,
          oauthAccounts: { create: account },
        },
        select: { id: true },
      });
      return { userId: user.id };
    });
    await afterCommit?.();
    return result;
  }

  /** 404 for unknown providers and for ones without configured credentials. */
  private enabledProvider(provider: string): OAuthProvider {
    const p = OAUTH_PROVIDERS.find((known) => known === provider);
    if (!p || !this.providers.isEnabled(p)) throw notFound();
    return p;
  }

  private loginError(error: OAuthLoginError): string {
    return `${this.appUrl()}/login?error=${error}`;
  }

  private appUrl(): string {
    return this.config.APP_URL.replace(/\/+$/, '');
  }

  /** Lax so the cookie survives the top-level redirect back from the provider. */
  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: OAUTH_COOKIE_PATH,
    };
  }
}
