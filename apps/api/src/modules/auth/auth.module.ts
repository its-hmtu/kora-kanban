import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfController } from './csrf.controller';
import { CsrfTokenService } from './csrf-token.service';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthProviderClient } from './oauth/oauth-provider.client';
import { OAuthService } from './oauth/oauth.service';
import { PasswordService } from './password.service';
import { CLOCK, SessionService, systemClock } from './session.service';
import { VerificationService } from './verification.service';

@Module({
  controllers: [CsrfController, AuthController, OAuthController],
  providers: [
    AuthService,
    SessionService,
    CsrfTokenService,
    PasswordService,
    VerificationService,
    OAuthService,
    OAuthProviderClient,
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [AuthService, SessionService, PasswordService, VerificationService],
})
export class AuthModule {}
