import { Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  forgotSchema,
  loginSchema,
  registerSchema,
  resetSchema,
  verifyEmailSchema,
  type ForgotInput,
  type LoginInput,
  type RegisterInput,
  type ResetInput,
  type VerifyEmailInput,
} from '@kora/shared';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { AuthThrottle } from '../../infra/throttler/use-throttler.decorator';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';

/** Email/password auth routes (contracts/rest-api.md "Auth & account"). */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @AuthThrottle()
  @Post('register')
  async register(
    @ZodBody(registerSchema) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthUser }> {
    return { user: await this.auth.register(body, req, res) };
  }

  @Public()
  @AuthThrottle()
  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@ZodBody(verifyEmailSchema) body: VerifyEmailInput): Promise<void> {
    await this.auth.verifyEmail(body.token);
  }

  @AuthThrottle()
  @Post('verify-email/resend')
  @HttpCode(204)
  async resendVerification(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.resendVerification(user);
  }

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(200)
  async login(
    @ZodBody(loginSchema) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthUser }> {
    return { user: await this.auth.login(body, req, res) };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req, res);
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutAll(user.id, res);
  }

  @Public()
  @AuthThrottle()
  @Post('password/forgot')
  @HttpCode(204)
  async forgotPassword(@ZodBody(forgotSchema) body: ForgotInput): Promise<void> {
    await this.auth.forgotPassword(body);
  }

  @Public()
  @AuthThrottle()
  @Post('password/reset')
  @HttpCode(204)
  async resetPassword(@ZodBody(resetSchema) body: ResetInput): Promise<void> {
    await this.auth.resetPassword(body);
  }
}
