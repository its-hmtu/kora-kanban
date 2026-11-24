import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { CSRF_COOKIE } from '../../common/guards/csrf.guard';
import { APP_CONFIG } from '../../infra/config/config.module';
import type { Env } from '../../infra/config/env';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { SESSION_TTL_MS } from './session.service';

/**
 * Issues the double-submit CSRF cookie (research B3). Used by `GET /auth/csrf` and on every
 * sign-in, so a token planted before authentication never survives it (token fixation).
 */
@Injectable()
export class CsrfTokenService {
  constructor(
    private readonly crypto: CryptoService,
    @Inject(APP_CONFIG) private readonly config: Env,
  ) {}

  /** Sets a fresh `kora_csrf` cookie and returns its value. */
  issue(res: Response): string {
    const token = this.crypto.randomToken();
    res.cookie(CSRF_COOKIE, token, { ...this.cookieOptions(), maxAge: SESSION_TTL_MS });
    return token;
  }

  clear(res: Response): void {
    res.clearCookie(CSRF_COOKIE, this.cookieOptions());
  }

  private cookieOptions(): CookieOptions {
    // Not HttpOnly: the SPA reads it and echoes it in X-CSRF-Token.
    return {
      httpOnly: false,
      secure: this.config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    };
  }
}
