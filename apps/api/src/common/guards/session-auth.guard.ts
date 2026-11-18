import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@kora/shared';
import type { Request, Response } from 'express';
import { SESSION_COOKIE, SessionService } from '../../modules/auth/session.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { DomainError } from '../errors/domain-error';

/**
 * Global authentication guard (registered as APP_GUARD in T037). Resolves the `kora_sid` cookie to
 * `req.user` / `req.session` (re-issuing the cookie when the session slid); routes without `@Public()` get 401 UNAUTHENTICATED when that fails.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const raw: unknown = req.cookies?.[SESSION_COOKIE];
    const token = typeof raw === 'string' ? raw : '';
    const auth = token ? await this.sessions.validate(token) : null;
    if (auth) {
      req.user = auth.user;
      req.session = auth.session;
      if (auth.refreshed) {
        this.sessions.setSessionCookie(context.switchToHttp().getResponse<Response>(), token);
      }
      return true;
    }
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    throw new DomainError(ErrorCode.UNAUTHENTICATED, 401);
  }
}
