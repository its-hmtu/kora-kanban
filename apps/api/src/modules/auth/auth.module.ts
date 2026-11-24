import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfController } from './csrf.controller';
import { CsrfTokenService } from './csrf-token.service';
import { PasswordService } from './password.service';
import { CLOCK, SessionService, systemClock } from './session.service';
import { VerificationService } from './verification.service';

@Module({
  controllers: [CsrfController, AuthController],
  providers: [
    AuthService,
    SessionService,
    CsrfTokenService,
    PasswordService,
    VerificationService,
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [AuthService, SessionService, PasswordService, VerificationService],
})
export class AuthModule {}
