import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { OAuthService } from './oauth.service';

/**
 * Google/GitHub sign-in (contracts/rest-api.md). Both are top-level browser navigations, so they
 * answer with redirects. GET, so no CSRF token; the signed state cookie protects the callback.
 */
@Controller('auth/oauth')
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  @Public()
  @Get(':provider')
  start(
    @Param('provider') provider: string,
    @Query('next') next: unknown,
    @Res() res: Response,
  ): void {
    const url = this.oauth.start(provider, next, res);
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, url);
  }

  @Public()
  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.oauth.callback(provider, query, req, res);
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, url);
  }
}
