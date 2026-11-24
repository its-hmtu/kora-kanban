import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CsrfTokenService } from './csrf-token.service';

/** Issues the double-submit CSRF token (research B3). GET, so `CsrfGuard` never blocks it. */
@Controller('auth')
export class CsrfController {
  constructor(private readonly csrfTokens: CsrfTokenService) {}

  @Public()
  @Get('csrf')
  @Header('Cache-Control', 'no-store')
  csrf(@Res({ passthrough: true }) res: Response): { csrfToken: string } {
    return { csrfToken: this.csrfTokens.issue(res) };
  }
}
