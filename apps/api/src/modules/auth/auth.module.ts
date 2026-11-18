import { Module } from '@nestjs/common';
import { CsrfController } from './csrf.controller';
import { CLOCK, SessionService, systemClock } from './session.service';

@Module({
  controllers: [CsrfController],
  providers: [SessionService, { provide: CLOCK, useValue: systemClock }],
  exports: [SessionService],
})
export class AuthModule {}
