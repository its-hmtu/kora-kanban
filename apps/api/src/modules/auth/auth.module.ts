import { Module } from '@nestjs/common';
import { CLOCK, SessionService, systemClock } from './session.service';

@Module({
  providers: [SessionService, { provide: CLOCK, useValue: systemClock }],
  exports: [SessionService],
})
export class AuthModule {}
