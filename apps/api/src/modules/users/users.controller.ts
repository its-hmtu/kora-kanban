import { Controller, Delete, Get, HttpCode, Patch, Put, Req, Res } from '@nestjs/common';
import {
  changePasswordSchema,
  updateMeSchema,
  type ChangePasswordInput,
  type UpdateMeInput,
} from '@kora/shared';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { AuthThrottle } from '../../infra/throttler/use-throttler.decorator';
import type { AuthUser } from '../auth/auth.types';
import { UsersService, type MeResponse } from './users.service';

/** The signed-in user's account (contracts/rest-api.md "Auth & account", `/me` rows). */
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  getMe(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    return this.users.getMe(user.id);
  }

  @Patch()
  updateMe(
    @CurrentUser() user: AuthUser,
    @ZodBody(updateMeSchema) body: UpdateMeInput,
  ): Promise<MeResponse> {
    return this.users.updateMe(user.id, body);
  }

  /** Throttled like sign-in: a stolen session must not be able to guess the current password. */
  @AuthThrottle()
  @Put('password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @ZodBody(changePasswordSchema) body: ChangePasswordInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.users.changePassword(user.id, body, req, res);
  }

  @Delete()
  @HttpCode(204)
  async deleteMe(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.users.deleteMe(user.id, res);
  }
}
