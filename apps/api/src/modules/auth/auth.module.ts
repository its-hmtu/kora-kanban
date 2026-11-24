import { Module } from '@nestjs/common';
import { CsrfController } from './csrf.controller';
import { PasswordService } from './password.service';
import { CLOCK, SessionService, systemClock } from './session.service';
import { VerificationService } from './verification.service';

@Module({
  controllers: [CsrfController],
  providers: [
    SessionService,
    PasswordService,
    VerificationService,
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [SessionService, PasswordService, VerificationService],
})
export class AuthModule {}
