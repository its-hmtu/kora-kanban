import { Controller, Get, Header, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CSRF_COOKIE } from '../../common/guards/csrf.guard';
import { APP_CONFIG } from '../../infra/config/config.module';
import type { Env } from '../../infra/config/env';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { SESSION_TTL_MS } from './session.service';

/** Issues the double-submit CSRF token (research B3). GET, so `CsrfGuard` never blocks it. */
@Controller('auth')
export class CsrfController {
  constructor(
    private readonly crypto: CryptoService,
    @Inject(APP_CONFIG) private readonly config: Env,
  ) {}

  @Public()
  @Get('csrf')
  @Header('Cache-Control', 'no-store')
  csrf(@Res({ passthrough: true }) res: Response): { csrfToken: string } {
    const csrfToken = this.crypto.randomToken();
    // Not HttpOnly: the SPA reads it and echoes it in X-CSRF-Token.
    res.cookie(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      secure: this.config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_MS,
    });
    return { csrfToken };
  }
}
