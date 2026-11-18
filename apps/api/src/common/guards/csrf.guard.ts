import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@kora/shared';
import type { Request } from 'express';
import { APP_CONFIG } from '../../infra/config/config.module';
import type { Env } from '../../infra/config/env';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { SESSION_COOKIE } from '../../modules/auth/session.service';
import { SKIP_CSRF_KEY } from '../decorators/skip-csrf.decorator';
import { DomainError } from '../errors/domain-error';

export const CSRF_COOKIE = 'kora_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** `Authorization: Bearer <token>` (scheme is case-insensitive, RFC 9110 §11.1). */
const BEARER = /^bearer\s+\S/i;

/**
 * Global CSRF guard (research B3; registered as APP_GUARD after SessionAuthGuard in T037).
 * Every non-GET/HEAD/OPTIONS request — `@Public()` ones such as login and register included —
 * must carry `Origin` equal to APP_URL's origin and an `X-CSRF-Token` header equal to the
 * `kora_csrf` cookie (double submit). Exempt: Bearer-token requests carrying no `kora_sid`
 * cookie, and `@SkipCsrf()` routes. Independent of `req.user`. Failures → 403 FORBIDDEN.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly appOrigin: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly crypto: CryptoService,
    @Inject(APP_CONFIG) config: Env,
  ) {
    this.appOrigin = new URL(config.APP_URL).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    // Bearer exemption: only when no `kora_sid` cookie rides along. A cross-site request can't
    // set Authorization without a CORS preflight, but if it did, a cookie session must still be
    // CSRF-checked. Uses cookie presence, not req.user, so it is independent of guard order.
    // P4 follow-up: SessionAuthGuard must ignore cookies when a Bearer header is present.
    const authorization = req.headers.authorization;
    const sessionCookie: unknown = req.cookies?.[SESSION_COOKIE];
    const hasSessionCookie = typeof sessionCookie === 'string' && sessionCookie !== '';
    if (typeof authorization === 'string' && BEARER.test(authorization) && !hasSessionCookie) {
      return true;
    }

    if (req.headers.origin !== this.appOrigin) throw new DomainError(ErrorCode.FORBIDDEN, 403);

    const header = req.headers[CSRF_HEADER];
    const cookie: unknown = req.cookies?.[CSRF_COOKIE];
    if (
      typeof header !== 'string' ||
      typeof cookie !== 'string' ||
      header === '' ||
      !this.crypto.timingSafeEqual(header, cookie)
    ) {
      throw new DomainError(ErrorCode.FORBIDDEN, 403);
    }
    return true;
  }
}
